#!/usr/bin/env bash
#
# نقل بيانات Neon إلى العنقود المحلي، لمرة واحدة. بصلاحية root، بعد
# setup-native.sh:
#
#   sudo ./migrate-from-neon.sh                      # مباشرة من Neon
#   sudo ./migrate-from-neon.sh --from-dump FILE     # من نسخة موجودة
#
# المباشر يقرأ من NEON_DATABASE_URL ولا يكتب في Neon شيئًا، ثم يعدّ صفوف كل
# جدول على الجهتين ولا يعلن النجاح إلا إن تطابقت كلها.
#
# `--from-dump` لحين يتعذّر الوصول إلى Neon — نفاد الحصة مثلًا — ووُجدت نسخة
# من backup.sh القديم في /var/backups/greencities. ما كُتب في Neon بعد وقت
# النسخة لا يصل، والسكربت يطبع ذلك الوقت قبل أن يبدأ.
#
# الجداول تُستعاد بصفة دور التطبيق فيملكها، ومعها جدول ترحيلات drizzle، فيكمل
# `drizzle-kit migrate` بعدها من حيث توقف Neon لا من البداية.

set -euo pipefail

# shellcheck disable=SC1091
. "$(dirname "$(readlink -f "$0")")/lib.sh"

require_root
require_db_settings
: "${DB_PASSWORD:?DB_PASSWORD فارغ — شغّل ./setup-native.sh أولًا}"
resolve_cluster

MODE=live
ARCHIVE=""
if [[ "${1:-}" == --from-dump ]]; then
  MODE=dump
  [[ -n "${2:-}" ]] || fail "الاستعمال: $0 --from-dump /var/backups/greencities/<ملف>.dump"
  ARCHIVE="$(readlink -f "$2")"
  [[ -f "$ARCHIVE" ]] || fail "لا ملف: $2"
elif [[ -n "${1:-}" ]]; then
  fail "خيار غير معروف: $1"
fi

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$BACKUP_DIR"
chown postgres:postgres "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

app_psql -tAc 'select 1' >/dev/null ||
  fail "$DB_USER لا يتصل عبر $SOCKET_DIR — شغّل ./setup-native.sh أولًا"

# ───────────────────────────── الاتصال بـNeon ─────────────────────────────
#
# الرابط يُفكَّك إلى متغيرات libpq لا يُمرَّر وسيطًا: الوسيط يظهر في `ps`
# لكل مستخدم على الخادم، ومتغيرات بيئة عملية root لا يقرؤها إلا root.

# فك ترميز النسبة المئوية، فتنجو كلمة مرور فيها @ / : #.
#
# الشرطة المائلة من متغير عمدًا: مكتوبة مباشرة تُعالَج مرتين — مرة لعلامات
# التنصيص ومرة للتوسيع — وعددها المطلوب يتغيّر بالسياق. قليلة فيُفك "%40"
# إلى "x40" حرفيًا، بصمت.
urldecode() {
  local s="${1//+/ }" backslash='\'
  s="${s//%/${backslash}x}"
  printf '%b' "$s"
}

parse_neon_url() {
  local rest="${NEON_DATABASE_URL#*://}" creds hostpart dbq query=""

  [[ "$rest" == *@* ]] || fail "NEON_DATABASE_URL بلا اسم مستخدم وكلمة مرور"
  creds="${rest%%@*}"; rest="${rest#*@}"
  NEON_USER="$(urldecode "${creds%%:*}")"
  NEON_PASS=""
  if [[ "$creds" == *:* ]]; then NEON_PASS="$(urldecode "${creds#*:}")"; fi

  hostpart="${rest%%/*}"
  dbq="${rest#*/}"
  NEON_DB="${dbq%%\?*}"
  if [[ "$dbq" == *\?* ]]; then query="${dbq#*\?}"; fi

  NEON_HOST="${hostpart%%:*}"
  if [[ "$hostpart" == *:* ]]; then NEON_PORT="${hostpart##*:}"; else NEON_PORT=5432; fi

  # Neon يرفض الاتصال بلا تشفير، فـTLS مطلوب ما لم يقل الرابط غير ذلك.
  NEON_SSLMODE=require
  if [[ "$query" =~ (^|&)sslmode=([^&]+) ]]; then NEON_SSLMODE="${BASH_REMATCH[2]}"; fi
  NEON_CHANNEL_BINDING=prefer
  if [[ "$query" =~ (^|&)channel_binding=([^&]+) ]]; then NEON_CHANNEL_BINDING="${BASH_REMATCH[2]}"; fi

  # آخر عبارة عمدًا: `[[ ]] && x` هنا يجعل الدالة تعيد 1 كلما كان الشرط
  # خاطئًا، فيُسقط المستدعي تحت `set -e`.
  [[ -n "$NEON_HOST" && -n "$NEON_DB" && -n "$NEON_USER" ]] ||
    fail "تعذّر تفكيك NEON_DATABASE_URL — المتوقع postgresql://user:password@host/dbname?sslmode=require"

  [[ "$NEON_HOST" != *-pooler.* ]] ||
    fail "NEON_DATABASE_URL يشير إلى النقطة المُجمَّعة (-pooler). pg_dump يحتاج المباشرة: احذف -pooler من اسم المضيف"
}

neon() {
  PGHOST="$NEON_HOST" PGPORT="$NEON_PORT" PGUSER="$NEON_USER" \
  PGPASSWORD="$NEON_PASS" PGDATABASE="$NEON_DB" PGSSLMODE="$NEON_SSLMODE" \
  PGCHANNELBINDING="$NEON_CHANNEL_BINDING" "$@"
}

# ─────────────────────────── 1. المصدر ───────────────────────────

if [[ "$MODE" == live ]]; then
  : "${NEON_DATABASE_URL:?NEON_DATABASE_URL فارغ في .env}"
  parse_neon_url

  # pg_dump يرفض القراءة من خادم أحدث منه — حد صلب في Postgres لا تحذير.
  log "فحص الإصدار (Neon: $NEON_HOST)"
  SRC_VERSION="$(neon "$PGBIN/psql" -X -tAc 'show server_version' 2>&1)" || {
    case "$SRC_VERSION" in
      *quota*)
        fail "Neon يرفض الاتصال لنفاد الحصة. إما ترقية الخطة مؤقتًا لإتمام النقل، أو النقل من نسخة موجودة:
  ls -lh $BACKUP_DIR
  sudo $0 --from-dump $BACKUP_DIR/<أحدث ملف>.dump" ;;
      *) fail "تعذّر الاتصال بـNeon: $SRC_VERSION" ;;
    esac
  }
  SRC_VERSION="$(tr -d '[:space:]' <<<"$SRC_VERSION")"
  SRC_MAJOR="${SRC_VERSION%%.*}"
  log "Neon على PostgreSQL $SRC_VERSION، والعنقود المحلي على $PG_MAJOR"
  [[ "$SRC_MAJOR" -le "$PG_MAJOR" ]] ||
    fail "Neon على $SRC_MAJOR وهذا الخادم على $PG_MAJOR — pg_dump $PG_MAJOR لا يقرأ من خادم أحدث"
else
  # فهرس الأرشيف يقول متى أُخذ ومن أي إصدار، دون اتصال بأي قاعدة.
  TOC="$("$PGBIN/pg_restore" --list "$ARCHIVE")" ||
    fail "$ARCHIVE ليس أرشيف pg_dump مقروءًا"
  CREATED="$(sed -n 's/^; Archive created at //p' <<<"$TOC")"
  DUMPED_BY="$(sed -n 's/^;[[:space:]]*Dumped by pg_dump version: \([0-9]*\).*/\1/p' <<<"$TOC")"
  [[ -n "$DUMPED_BY" && "$DUMPED_BY" -le "$PG_MAJOR" ]] ||
    fail "الأرشيف من pg_dump ${DUMPED_BY:-مجهول}، وpg_restore $PG_MAJOR لا يقرأ أرشيفًا أحدث منه"

  cat <<WARN

  النقل من نسخة لا من Neon مباشرة:
    الملف      $(basename "$ARCHIVE")
    أُخذت في   $CREATED

  ما كُتب في Neon بعد هذا الوقت لن يصل إلى القاعدة المحلية.

WARN
  read -r -p "اكتب yes للاستمرار: " CONFIRM
  [[ "$CONFIRM" == yes ]] || fail "أُلغي"
fi

# ─────────────────────────── 2. هل الهدف فارغ؟ ───────────────────────────

EXISTING="$(table_count)"
log "القاعدة $DB_NAME تحمل الآن $EXISTING جدولًا"

WRITERS=""
restart_writers() {
  if [[ -n "$WRITERS" ]]; then
    log "إعادة تشغيل: $WRITERS"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" start $WRITERS >/dev/null || true
  fi
}
trap restart_writers EXIT

if [[ "$EXISTING" != 0 ]]; then
  cat <<WARN

  $DB_NAME تحمل $EXISTING جدولًا. المتابعة تستبدل كل ما فيها بما في المصدر.
  تُؤخذ نسخة أمان منها أولًا.

WARN
  read -r -p "اكتب اسم القاعدة للمتابعة: " CONFIRM
  [[ "$CONFIRM" == "$DB_NAME" ]] || fail "أُلغي"

  log "نسخة أمان من الحالة الحالية"
  dump_local "$BACKUP_DIR/pre-migrate-$STAMP.dump" || fail "فشلت نسخة الأمان — لم يُمَس شيء"
fi

# ما يكتب في القاعدة يُوقَف طوال النقل في حالتين:
#   - المصدر Neon حيّ: كتابة أثناء التفريغ تجعل عدّ الصفوف بعده لا يطابق، فيفشل
#     التحقق ويُعاد النقل كله.
#   - الهدف غير فارغ: قد يكون ما يخدمه الـAPI الآن، فلا يكتب في منتصف الاستبدال.
if [[ "$MODE" == live || "$EXISTING" != 0 ]]; then
  WRITERS="$(running_writers | tr '\n' ' ')"
  if [[ -n "$WRITERS" ]]; then
    log "إيقاف مؤقت لما يكتب في القاعدة: $WRITERS"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" stop $WRITERS >/dev/null
  fi
fi

# ─────────────────────────── 3. التفريغ من Neon ───────────────────────────

if [[ "$MODE" == live ]]; then
  ARCHIVE="$BACKUP_DIR/neon-$STAMP.dump"
  # --no-owner/--no-privileges تحذف أسماء أدوار Neon، ولا وجود لها هنا.
  log "تفريغ Neon ← $(basename "$ARCHIVE") (الخطوة البطيئة)"
  neon "$PGBIN/pg_dump" -Fc --no-owner --no-privileges -f "$ARCHIVE.partial" ||
    { rm -f "$ARCHIVE.partial"; fail "فشل pg_dump من Neon"; }
  mv "$ARCHIVE.partial" "$ARCHIVE"
  chown postgres:postgres "$ARCHIVE"
  chmod 600 "$ARCHIVE"
  log "كُتب: $(du -h "$ARCHIVE" | cut -f1)"
fi

# ─────────────────────────── 4. الاستعادة ───────────────────────────

# حذف واستعادة في معاملة واحدة: الفشل يترك القاعدة المحلية كما كانت.
log "الاستعادة إلى $DB_NAME بصفة $DB_USER"
replace_from_archive "$ARCHIVE" ||
  fail "فشلت الاستعادة وتراجعت كلها — القاعدة المحلية لم تتغير"

# بصفة المشرف: ANALYZE بصفة دور التطبيق يطبع تحذيرًا لكل فهرس نظام لا يملكه،
# فيدفن المخرجات المهمة. والجداول التي تعنينا تُحلَّل في الحالتين.
log "تحديث إحصاءات المخطِّط"
su_psql -d "$DB_NAME" -c 'ANALYZE;'

# ─────────────────────────── 5. التحقق ───────────────────────────

# sed لا grep: `grep -v` على مدخل فارغ يخرج بـ1، ومع pipefail يُسقط السكربت.
counts() { sed -e 's/[[:space:]]*$//' -e '/^$/d' | sort; }

if [[ "$MODE" == live ]]; then
  # عدد صفوف دقيق لكل جدول على الجهتين. جدول واحد يختلف يعني نسخة لا يوثق
  # بها، والسكربت يرفض أن يسميها نجاحًا.
  log "عدّ الصفوف على الجهتين"
  neon "$PGBIN/psql" -X -tA -f "$HERE/sql/row-counts.sql" | counts > "$BACKUP_DIR/counts-neon-$STAMP.txt"
  app_psql -tA -f "$HERE/sql/row-counts.sql" | counts > "$BACKUP_DIR/counts-local-$STAMP.txt"

  if ! diff -u "$BACKUP_DIR/counts-neon-$STAMP.txt" "$BACKUP_DIR/counts-local-$STAMP.txt" \
       > "$BACKUP_DIR/counts-diff-$STAMP.txt"; then
    cat >&2 <<MISMATCH

  ✗ القاعدتان لا تتطابقان:
      $BACKUP_DIR/counts-diff-$STAMP.txt

  لا تنقل الـAPI. السبب المعتاد صفوف كُتبت في Neon أثناء التفريغ — أعد
  التشغيل في وقت هادئ، فلا يُفقد شيء بالمحاولة.

MISMATCH
    exit 1
  fi
  rm -f "$BACKUP_DIR/counts-diff-$STAMP.txt"
  SOURCE_TABLES=$(wc -l < "$BACKUP_DIR/counts-neon-$STAMP.txt" | tr -d ' ')
else
  # لا مصدر حي نعدّ صفوفه، فأقصى الممكن أن كل جدول في الأرشيف وصل.
  SOURCE_TABLES=$(grep -c ' TABLE DATA ' <<<"$TOC" || true)
  app_psql -tA -f "$HERE/sql/row-counts.sql" | counts > "$BACKUP_DIR/counts-local-$STAMP.txt"
  LOCAL_TABLES=$(wc -l < "$BACKUP_DIR/counts-local-$STAMP.txt" | tr -d ' ')
  [[ "$SOURCE_TABLES" == "$LOCAL_TABLES" ]] ||
    fail "الأرشيف فيه $SOURCE_TABLES جدولًا ووصل $LOCAL_TABLES — لا تنقل الـAPI"
fi

TOTAL=$(awk '{s += $2} END {print s + 0}' "$BACKUP_DIR/counts-local-$STAMP.txt")
OWNED=$(app_psql -tAc "select count(*) from pg_tables where schemaname = 'public' and tableowner = current_user" | tr -d '[:space:]')
MIGRATIONS=$(app_psql -tAc "select count(*) from public.__drizzle_migrations" 2>/dev/null | tr -d '[:space:]' || true)

log "✓ $SOURCE_TABLES جدولًا و$TOTAL صفًّا$([[ "$MODE" == live ]] && printf '، متطابقة على الجهتين')"
log "  $OWNED جدولًا في public يملكها $DB_USER، و${MIGRATIONS:-0} ترحيلًا مسجّلًا"

cat <<NEXT

التالي — نقل الـAPI إلى القاعدة المحلية:

  1. في /opt/greencities/GreenBackend/deploy/.env ضع:

       DATABASE_URL=postgresql://$DB_USER:<DB_PASSWORD>@localhost:$PG_PORT/$DB_NAME?host=/var/run/postgresql&sslmode=disable
       DATABASE_SSL=false

     واحذف سطر DIRECT_URL كله. بقاؤه على Neon يجعل الترحيل يجري هناك
     والتطبيق يقرأ من هنا — وdeploy.sh يرفض النشر في هذه الحالة.

     كلمة المرور:  grep '^DB_PASSWORD=' $HERE/.env
     (لا يطبعها هذا السكربت: المخرجات تُنسخ إلى محادثات وتذاكر.)

     `localhost` في الرابط ليس اتصال شبكة: `host=` بعده يوجّه pg إلى المقبس.
     وجوده شرط لأن التحقق من المتغيرات يرفض رابطًا بمضيف فارغ.

  2. أعد النشر:   /opt/greencities/GreenBackend/deploy/deploy.sh
     الترحيل لا يجد جديدًا، والمزامنة تمنح القدرات، ثم يبدأ الـAPI.

  3. جرّب اللوحة على البيانات الحقيقية.

  4. النسخ الاحتياطي ليس اختياريًا الآن — القسم في deploy/README.md.

  5. اترك مشروع Neon كما هو أيامًا احتياطًا، ثم امسح NEON_DATABASE_URL من
     $HERE/.env

NEXT
