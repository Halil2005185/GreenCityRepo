#!/usr/bin/env bash
#
# نسخة احتياطية من قاعدة الإنتاج بصيغة pg_dump المخصصة (مضغوطة وقابلة
# للاسترجاع الجزئي عبر pg_restore).
#
#   0 3 * * * /home/deploy/GreenCitys/GreenBackend/deploy/backup.sh >> /var/log/greencities-backup.log 2>&1
#
# متغيرات اختيارية:
#   BACKUP_DIR=/var/backups/greencities
#   BACKUP_RETENTION_DAYS=14

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/greencities}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

[ -f "${ENV_FILE}" ] || fail "الملف ${ENV_FILE} غير موجود."

# قراءة المتغيرين المطلوبين بدل `source` للملف كاملًا: قيم مثل
# `MAIL_FROM=Green Cities <no-reply@…>` صالحة عند Compose، لكن الصدفة
# تقرأ `<` كإعادة توجيه فتنكسر عليها.
read_env() {
  grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- | tr -d '\r'
}

DB_USER="$(read_env POSTGRES_USER)"
DB_NAME="$(read_env POSTGRES_DB)"

[ -n "${DB_USER}" ] || fail 'POSTGRES_USER غير معرّف في .env'
[ -n "${DB_NAME}" ] || fail 'POSTGRES_DB غير معرّف في .env'

mkdir -p "${BACKUP_DIR}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/${DB_NAME}-${STAMP}.dump"

# الكتابة إلى ملف مؤقت ثم النقل: انقطاع في المنتصف لا يترك ملفًا يبدو نسخة
# صالحة ويُعتمد عليه يوم الحاجة.
trap 'rm -f "${TARGET}.partial"' EXIT

docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --format=custom \
  > "${TARGET}.partial"

SIZE="$(stat -c '%s' "${TARGET}.partial")"

# ملف أصغر من كيلوبايت واحد ليس نسخة بل رسالة خطأ التُقطت من الأنبوب.
[ "${SIZE}" -gt 1024 ] || fail "النسخة فارغة (${SIZE} بايت)."

mv "${TARGET}.partial" "${TARGET}"
chmod 600 "${TARGET}"
trap - EXIT

printf '✓ %s (%s بايت)\n' "${TARGET}" "${SIZE}"

# الحذف بعد نجاح النسخة الجديدة لا قبلها: فشل اليوم لا يُفقد نسخ الأمس.
find "${BACKUP_DIR}" -name "${DB_NAME}-*.dump" -mtime "+${RETENTION_DAYS}" -delete

# نسخة على القرص نفسه لا تحمي من فقد الخادم. أضف هنا نقلًا خارجيًا —
# rsync إلى خادم آخر أو رفعًا إلى تخزين كائنات — وإلا فالحماية ناقصة.
