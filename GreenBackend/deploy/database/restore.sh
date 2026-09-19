#!/usr/bin/env bash
#
# استعادة القاعدة من نسخة. بصلاحية root:
#
#   sudo ./restore.sh                                          # يعرض النسخ
#   sudo ./restore.sh /var/backups/greencities/<ملف>.dump      # يستعيدها
#
# هذا يستبدل محتوى القاعدة كله. يأخذ نسخة أمان أولًا، ويوقف الـAPI والعامل كي
# لا يكتب أحد في المنتصف، ويطلب كتابة اسم القاعدة للتأكيد.
#
# الحذف والاستعادة في معاملة واحدة وبصفة دور التطبيق — التفاصيل عند
# replace_from_archive في lib.sh. فشلٌ في المنتصف يترك البيانات كما كانت، وما
# يُستعاد يملكه الدور الذي يستعمله الـAPI.

set -euo pipefail

# shellcheck disable=SC1091
. "$(dirname "$(readlink -f "$0")")/lib.sh"

require_root
require_db_settings
: "${DB_PASSWORD:?DB_PASSWORD فارغ في .env}"
resolve_cluster

if [[ $# -lt 1 ]]; then
  echo "النسخ المتاحة:"
  ls -lht "$BACKUP_DIR"/*.dump 2>/dev/null || echo "  (لا شيء)"
  echo
  echo "الاستعمال: sudo $0 $BACKUP_DIR/greencities-YYYY-MM-DDTHH-MM-SSZ.dump"
  exit 1
fi

ARCHIVE="$(readlink -f "$1")"
[[ -f "$ARCHIVE" ]] || fail "لا ملف: $1"

# إثبات أن الأرشيف مقروء قبل هدم أي شيء.
TOC="$("$PGBIN/pg_restore" --list "$ARCHIVE")" || fail "$1 ليس أرشيف pg_dump مقروءًا"

cat <<WARN

  استعادة    $(basename "$ARCHIVE")
  أُخذت في   $(sed -n 's/^; Archive created at //p' <<<"$TOC")
  إلى        $DB_NAME على $(hostname)

  كل جدول في $DB_NAME يُحذف ويُبنى من الأرشيف. ما كُتب بعد وقت النسخة يضيع.

WARN
read -r -p "اكتب اسم القاعدة للمتابعة: " CONFIRM
[[ "$CONFIRM" == "$DB_NAME" ]] || fail "أُلغي"

# ─────────────────────────── نسخة أمان ───────────────────────────

SAFETY="$BACKUP_DIR/pre-restore-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"
log "نسخة أمان من الحالة الحالية ← $(basename "$SAFETY")"
dump_local "$SAFETY" || fail "فشلت نسخة الأمان — لن تُجرى الاستعادة"

# ─────────────────────────── إيقاف الكتّاب ───────────────────────────

WRITERS="$(running_writers | tr '\n' ' ')"
restart_writers() {
  if [[ -n "$WRITERS" ]]; then
    log "إعادة تشغيل: $WRITERS"
    # shellcheck disable=SC2086
    docker compose -f "$COMPOSE_FILE" start $WRITERS >/dev/null || true
  fi
}
trap restart_writers EXIT

if [[ -n "$WRITERS" ]]; then
  log "إيقاف ما يكتب في القاعدة: $WRITERS"
  # shellcheck disable=SC2086
  docker compose -f "$COMPOSE_FILE" stop $WRITERS >/dev/null
fi

# ─────────────────────────────── الاستعادة ───────────────────────────────

log "الاستعادة"
replace_from_archive "$ARCHIVE" ||
  fail "فشلت الاستعادة وتراجعت كلها — القاعدة لم تتغير"

log "تحديث إحصاءات المخطِّط"
su_psql -d "$DB_NAME" -c 'ANALYZE;'

log "اكتملت الاستعادة — الحالة السابقة في $(basename "$SAFETY")"
