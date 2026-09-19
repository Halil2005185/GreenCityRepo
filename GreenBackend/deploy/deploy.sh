#!/usr/bin/env bash
#
# نشر الباك‌اند على الـVPS. يُنفَّذ على الخادم، يدويًا أو من CI عبر SSH:
#
#   /opt/greencities/GreenBackend/deploy/deploy.sh
#
# الكود يصل إلى الخادم دفعًا من GitHub Actions لا سحبًا من الخادم: سياسة
# المنظمة تمنع deploy keys، والدفع يلغي حاجة الخادم إلى أي اعتماد لـGitHub
# أصلًا. لذلك لا git هنا — السكربت يبني ما يجده في مكانه.
#
# متغيرات اختيارية:
#   HEALTH_RETRIES=30    عدد محاولات فحص الجاهزية بفاصل ثانيتين

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
REVISION_FILE="${SCRIPT_DIR}/REVISION"

HEALTH_RETRIES="${HEALTH_RETRIES:-30}"

log() { printf '\n\033[1;32m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ─────────────────────────── فحوص أولية ───────────────────────────

command -v docker >/dev/null || fail 'docker غير مثبت.'
docker compose version >/dev/null 2>&1 || fail 'docker compose v2 غير متاح.'
command -v curl >/dev/null || fail 'curl غير مثبت — يلزم لفحص الجاهزية.'

[ -f "${COMPOSE_FILE}" ] || fail "الملف ${COMPOSE_FILE} غير موجود. لم تصل شجرة الكود إلى الخادم."

# الغياب هنا يعني بدء الخدمات بمتغيرات ناقصة ثم سقوطها عند فحص Zod.
[ -f "${ENV_FILE}" ] || fail "الملف ${ENV_FILE} غير موجود. انسخ .env.vps.example إليه أولًا."

# ملف الأسرار لا يُقرأ إلا من مالكه.
if [ "$(stat -c '%a' "${ENV_FILE}")" != "600" ]; then
  printf '\033[1;33m! صلاحيات %s ليست 600 — نفّذ: chmod 600 %s\033[0m\n' "${ENV_FILE}" "${ENV_FILE}"
fi

if [ -f "${REVISION_FILE}" ]; then
  log "الإصدار: $(cat "${REVISION_FILE}")"
else
  log 'الإصدار: غير معروف (نشر يدوي بلا ملف REVISION)'
fi

# ─────────────────────── القاعدة على هذا الخادم ───────────────────────

# قراءة متغير بعينه لا `source` للملف: قيم مثل `MAIL_FROM=Green Cities <…>`
# صالحة عند Compose، والصدفة تقرأ `<` فيها إعادة توجيه.
read_env() { grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- | tr -d '\r' || true; }

DB_URL_VALUE="$(read_env DATABASE_URL)"

# فحصان قبل البناء لا بعده، حين تكون القاعدة المحلية هي المقصودة. كلاهما
# يفشل بعد دقيقتين من البناء برسالة لا تشير إلى السبب لو تُرك للترحيل:
if [[ "${DB_URL_VALUE}" == *'host=/var/run/postgresql'* ]]; then
  SOCKET_DIR="$(read_env PG_SOCKET_DIR)"
  SOCKET_DIR="${SOCKET_DIR:-/var/lib/greencities-pgsocket}"

  # 1. العنقود يعمل ومقبسه حيث تركّبه الحاويات.
  compgen -G "${SOCKET_DIR}/.s.PGSQL.*" >/dev/null ||
    fail "لا مقبس PostgreSQL في ${SOCKET_DIR}. هل العنقود يعمل؟  systemctl status 'postgresql@18-*'"

  # 2. لا قاعدتان. drizzle-kit يفضّل DIRECT_URL على DATABASE_URL، فـDIRECT_URL
  # باقٍ على Neon يجعل الترحيل يجري هناك والتطبيق يقرأ من هنا: جداول جديدة
  # لا يراها الـAPI، وفشل يظهر بعد أيام في غير موضعه.
  DIRECT_URL_VALUE="$(read_env DIRECT_URL)"
  if [ -n "${DIRECT_URL_VALUE}" ] && [ "${DIRECT_URL_VALUE}" != "${DB_URL_VALUE}" ]; then
    fail "DIRECT_URL في ${ENV_FILE} يشير إلى قاعدة غير DATABASE_URL. احذف سطر DIRECT_URL — القاعدة المحلية لا تحتاجه."
  fi
fi

# ─────────────────────────────── البناء ───────────────────────────────

# وسم الصورة القائمة قبل استبدالها: يتيح إرجاع الكود إن فشل الإصدار الجديد.
if docker image inspect greencities-api:local >/dev/null 2>&1; then
  docker tag greencities-api:local greencities-api:previous
fi

log 'بناء الصور'
docker compose -f "${COMPOSE_FILE}" build

# ───────────────────────── الترحيل والمزامنة ─────────────────────────

# خطوة مستقلة قبل لمس الخدمات، لا تبعية تُحلّ داخل `up`.
#
# `up -d` يعيد إنشاء api وworker — يوقف القديمين ويزيلهما — ثم ينتظر نجاح
# migrate. فإن فشل الترحيل بقي الخادم بلا API إطلاقًا: الإصدار الجديد لم
# يبدأ، والعامل أُزيل. هذا ما حدث في نشر #31. تشغيله هنا أولًا يجعل الفشل
# يوقف السكربت والإصدار القديم ما زال يخدم.
#
# و`run` يطبع المخرجات هنا لا في سجل حاوية على الخادم، فيظهر سبب الفشل في
# سجل GitHub Actions مباشرة. المزامنة لا تطبع أسرارًا، وفشل التحقق من
# البيئة يطبع أسماء المتغيرات لا قيمها.
log 'الترحيل والمزامنة'
docker compose -f "${COMPOSE_FILE}" run --rm -T migrate

# `--no-deps`: الترحيل نجح للتو، وتركه لـ`up` يعيد تشغيله ويعيد معه الخلل
# نفسه — إزالة الإصدار العامل قبل انتظار النتيجة.
log 'تشغيل الخدمات'
docker compose -f "${COMPOSE_FILE}" up -d --no-deps --remove-orphans api worker

# ────────────────────────── فحص الجاهزية ──────────────────────────

API_PORT="$(grep -E '^API_PORT=' "${ENV_FILE}" | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
API_PORT="${API_PORT:-4000}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health/ready"

log "فحص ${HEALTH_URL}"

for attempt in $(seq 1 "${HEALTH_RETRIES}"); do
  if curl -fsS --max-time 5 "${HEALTH_URL}" >/dev/null 2>&1; then
    log "جاهز بعد ${attempt} محاولة."
    docker compose -f "${COMPOSE_FILE}" ps
    docker image prune -f >/dev/null
    # حاوية migrate من التدفق القديم (`up`) تبقى «Exited» بسجل قديم يضلّل
    # من يقرؤه. بعد نجاح النشر وحده، فلا تُمحى أدلة فشل لم يُقرأ بعد.
    docker compose -f "${COMPOSE_FILE}" rm -f migrate >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

# ─────────────────────────────── الفشل ───────────────────────────────

printf '\n\033[1;31m✗ لم يصبح الـAPI جاهزًا خلال %s ثانية.\033[0m\n' "$((HEALTH_RETRIES * 2))" >&2
docker compose -f "${COMPOSE_FILE}" ps
# سجل migrate طُبع أعلاه من `run --rm`، ولا حاوية باقية يُقرأ منها.
docker compose -f "${COMPOSE_FILE}" logs --tail 80 api worker

cat >&2 <<'EOF'

للرجوع إلى الصورة السابقة:

  docker tag greencities-api:previous greencities-api:local
  docker compose -f compose.prod.yml up -d --no-build --no-deps api worker

`--no-deps` ضروري: بدونه يعيد `up` تشغيل migrate، فإن كان هو ما يفشل
أُزيل الإصدار العامل قبل انتظار نتيجته، وصار الرجوع نفسه انقطاعًا.

هذا يرجّع الكود وحده. إن كان الإصدار الفاشل قد طبّق ترحيلًا فالمخطط لا
يعود معه، وإرجاع الكود قد لا يكفي — راجع سجل migrate أعلاه قبل القرار.
EOF

exit 1
