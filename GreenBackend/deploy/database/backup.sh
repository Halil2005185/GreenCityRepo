#!/usr/bin/env bash
#
# نسخة احتياطية من القاعدة المحلية. بصلاحية root، وهكذا يشغّلها cron:
#
#   sudo ./backup.sh            # تفريغ، تحقق، تدوير، رفع خارجي
#   sudo ./backup.sh --local    # بلا رفع
#
# التفريغ بصفة postgres عبر المقبس المحزوم، فلا كلمة مرور في شيء.
#
# كل خطوة مفحوصة: يخرج بغير الصفر إن كانت النسخة ناقصة أو فارغة أو لا يقرؤها
# pg_restore، فلا يتنكّر فشل صامت في هيئة نسخة ناجحة.

set -euo pipefail

# shellcheck disable=SC1091
. "$(dirname "$(readlink -f "$0")")/lib.sh"

require_root
require_db_settings
resolve_cluster

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
NAME="greencities-$STAMP.dump"
SKIP_UPLOAD=0
[[ "${1:-}" == --local ]] && SKIP_UPLOAD=1

mkdir -p "$BACKUP_DIR"
# النسخ تحمل كل صف في القاعدة. postgres يكتبها، ولا أحد غيره يحتاج قراءتها.
chown postgres:postgres "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# ─────────────────────────── مساحة القرص ───────────────────────────

# Postgres لا يتدهور بلطف حين يمتلئ القرص: يتوقف عن قبول الكتابة وقد يترك
# العنقود محتاجًا استردادًا. النسخ تشارك القرص ملفات القاعدة، فلا نزيد الطين.
AVAIL_PCT=$(( 100 - $(df --output=pcent "$BACKUP_DIR" | tail -1 | tr -dc '0-9') ))
[[ "$AVAIL_PCT" -ge 10 ]] ||
  fail "المساحة الحرة ${AVAIL_PCT}% فقط — أفرغ مساحة قبل النسخ"
[[ "$AVAIL_PCT" -ge 20 ]] || log "تنبيه: المساحة الحرة ${AVAIL_PCT}% فقط"

# ─────────────────────────────── التفريغ ───────────────────────────────

# -Fc صيغة مخصصة: مضغوطة، وpg_restore يقرأ منها انتقائيًا.
log "تفريغ $DB_NAME ← $NAME"
dump_local "$BACKUP_DIR/$NAME" || fail "فشل pg_dump"
[[ -s "$BACKUP_DIR/$NAME" ]] || fail "النسخة فارغة"
chmod 600 "$BACKUP_DIR/$NAME"

# ─────────────────────────────── التحقق ───────────────────────────────

# قراءة فهرس الأرشيف تثبت أنه كامل وسليم. تفريغ انقطع يفشل هنا لا بعد ثلاثة
# أشهر يوم الحاجة إليه. `--list` يقرأ الملف وحده دون اتصال بأي قاعدة.
TOC="$("$PGBIN/pg_restore" --list "$BACKUP_DIR/$NAME")" || fail "الأرشيف لا يُقرأ"
TABLES=$(grep -c ' TABLE DATA ' <<<"$TOC" || true)
[[ "$TABLES" -gt 0 ]] || fail "الأرشيف بلا بيانات جداول"
log "سليمة: $(du -h "$BACKUP_DIR/$NAME" | cut -f1)، $TABLES جدولًا"

# ─────────────────────────── نسخة خارج الخادم ───────────────────────────

if [[ -n "${BACKUP_R2_BUCKET:-}" && "$SKIP_UPLOAD" -eq 0 ]]; then
  log "رفع إلى r2://$BACKUP_R2_BUCKET"
  # aws-cli في حاوية مؤقتة، فلا يحتاج المضيف تثبيتًا.
  #
  # مجموعات التحقق عند الحاجة وحدها: الإصدارات الحديثة من أدوات AWS تضيف
  # مجموعًا لكل طلب افتراضيًا، وR2 لم يقبل ذلك دائمًا — الخلل نفسه الذي
  # أُصلح في روابط الرفع الموقّعة في الـAPI.
  r2() {
    docker run --rm \
      -e AWS_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID" \
      -e AWS_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY" \
      -e AWS_DEFAULT_REGION=auto \
      -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
      -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
      -v "$BACKUP_DIR:/data:ro" \
      amazon/aws-cli:latest "$@" --endpoint-url "$BACKUP_R2_ENDPOINT"
  }
  r2 s3 cp "/data/$NAME" "s3://$BACKUP_R2_BUCKET/$NAME" --only-show-errors ||
    fail "فشل الرفع — النسخة المحلية كُتبت رغم ذلك"

  # التدوير هناك أيضًا، الأقدم أولًا. الأسماء تُرتَّب زمنيًا بتصميمها.
  KEEP_REMOTE="${BACKUP_R2_KEEP:-60}"
  mapfile -t OLD < <(
    r2 s3 ls "s3://$BACKUP_R2_BUCKET/" |
      awk '{print $4}' | grep '^greencities-.*\.dump$' | sort | head -n -"$KEEP_REMOTE" || true
  )
  for obj in "${OLD[@]}"; do
    [[ -n "$obj" ]] || continue
    log "حذف القديم هناك: $obj"
    r2 s3 rm "s3://$BACKUP_R2_BUCKET/$obj" --only-show-errors
  done
elif [[ -z "${BACKUP_R2_BUCKET:-}" ]]; then
  log "تنبيه: BACKUP_R2_BUCKET فارغ — هذه النسخة على هذا الخادم وحده"
fi

# ─────────────────────────── التدوير المحلي ───────────────────────────

# -mtime +N يحذف الأقدم من N يومًا بصرامة، فالنسخة الأحدث لا تكون مرشحة أبدًا
# مهما طال التفريغ. ونسخ Neon وما قبل الاستعادة بأسماء أخرى، فلا تُمَس.
find "$BACKUP_DIR" -name 'greencities-*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete |
  while read -r f; do log "حذف القديم هنا: $(basename "$f")"; done

# علامة آخر نجاح. cron على هذا الخادم لا يرسل بريدًا يُقرأ، والسجل الذي لا
# يقرؤه أحد ليس مراقبة — فهذا على الأقل يجيب عن «متى نجحت آخر نسخة؟» بأمر:
#   sudo cat /var/backups/greencities/.last-success
date -u +%Y-%m-%dT%H:%M:%SZ > "$BACKUP_DIR/.last-success"

log "اكتمل النسخ"
