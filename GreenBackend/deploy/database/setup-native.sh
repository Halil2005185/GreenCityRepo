#!/usr/bin/env bash
#
# تجهيز PostgreSQL 18 أصليًّا على الخادم للمدن الخضراء. بصلاحية root:
#
#   sudo ./setup-native.sh
#
# متكرر بلا ضرر: كل خطوة تفحص قبل أن تفعل. لكنه يعيد تشغيل العنقود في آخره،
# فتشغيله والموقع يعمل يقطع الاتصال بالقاعدة ثوانيَ.
#
# ما يفعله:
#   1. يثبّت PostgreSQL 18 من مستودع المشروع إن لم يكن مثبتًا
#   2. ينشئ عنقودًا مخصصًا `18/$PG_CLUSTER` بإعدادات لغة Neon نفسها
#   3. مجلد مقبس دائم تركّبه الحاويات
#   4. greencities.conf في conf.d العنقود
#   5. قاعدة pg_hba تسمح لدور التطبيق بكلمة مرور عبر المقبس
#   6. الدور والقاعدة وملكيتهما، وإحصاءات الاستعلامات
#   7. يثبت أن الطريق الذي سيستعمله الـAPI يعمل فعلًا

set -euo pipefail

# shellcheck disable=SC1091
. "$(dirname "$(readlink -f "$0")")/lib.sh"

require_root
require_db_settings

# ───────────────────────────── كلمة المرور ─────────────────────────────

# تُولَّد إن كانت فارغة وتُكتب في .env، فلا يطبعها شيء ولا تمر بطرفية. وتُحصر
# في أحرف لا تحتاج ترميزًا داخل رابط ولا تنصيصًا داخل SQL: كلمة فيها @ أو /
# تكسر DATABASE_URL بخطأ لا يشير إليها.
if [[ -z "${DB_PASSWORD:-}" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  if grep -qE '^DB_PASSWORD=' "$HERE/.env"; then
    sed -i -E "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" "$HERE/.env"
  else
    printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD" >> "$HERE/.env"
  fi
  log "ولّدت كلمة مرور للدور وكتبتها في .env"
fi
[[ "$DB_PASSWORD" =~ ^[A-Za-z0-9._~-]{16,}$ ]] ||
  fail "DB_PASSWORD: ستة عشر حرفًا على الأقل من A-Z a-z 0-9 . _ ~ - — ولّد واحدة: openssl rand -hex 24"

chmod 600 "$HERE/.env"

# ─────────────────────────── 1. التثبيت ───────────────────────────

if [[ ! -x "$PGBIN/postgres" ]]; then
  log "تثبيت PostgreSQL $PG_MAJOR من apt.postgresql.org"
  # مستودع المشروع لا مستودع التوزيعة: Ubuntu 24.04 يحمل 16، وNeon على 18،
  # وpg_dump أقدم من الخادم يرفض القراءة منه من أساسه.
  # لا سؤال تفاعليًا في منتصف سكربت: الواجهة الصامتة تُبقي أي ملف إعداد
  # مُعدَّل كما هو بدل انتظار جواب لا يأتي، ومعها dpkg وucf لكلا نوعي الملفات.
  export DEBIAN_FRONTEND=noninteractive UCF_FORCE_CONFFOLD=1
  APT=(apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

  "${APT[@]}" update
  "${APT[@]}" install postgresql-common openssl
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y

  # ترقية postgresql-common إلى نسخة المستودع الجديد قبل تعديل ملفه لا بعده.
  # تثبيت postgresql-18 يجرّها على كل حال، فلو كان الملف معدَّلًا حينها لوجده
  # ucf «محرَّرًا محليًا» وسأل أيّ النسختين تُبقى — سؤال يوقف السكربت.
  "${APT[@]}" install postgresql-common

  # الحزمة تنشئ عنقود `18/main` تلقائيًا ولن يستعمله أحد: عنقود فارغ يأكل
  # ذاكرة ويحجز منفذًا. الإنشاء التلقائي يُعطَّل طوال تثبيتنا وحده ثم يعود
  # الملف كما كان، فلا يتغيّر سلوك الخادم لمن يثبّت إصدارًا آخر بعدنا.
  CREATECLUSTER=/etc/postgresql-common/createcluster.conf
  cp -a "$CREATECLUSTER" "$CREATECLUSTER.greencities-orig"
  trap 'mv -f "$CREATECLUSTER.greencities-orig" "$CREATECLUSTER"' EXIT
  sed -i -E 's/^#?[[:space:]]*create_main_cluster[[:space:]]*=.*/create_main_cluster = false/' "$CREATECLUSTER"
  grep -qE '^create_main_cluster = false' "$CREATECLUSTER" ||
    printf 'create_main_cluster = false\n' >> "$CREATECLUSTER"

  "${APT[@]}" install "postgresql-$PG_MAJOR"

  mv -f "$CREATECLUSTER.greencities-orig" "$CREATECLUSTER"
  trap - EXIT
fi

# ──────────────────────────── 2. العنقود ────────────────────────────

if [[ -z "$(cluster_line)" ]]; then
  log "إنشاء العنقود $PG_MAJOR/$CLUSTER"
  # إعدادات اللغة نفسها التي على Neon — مزوّد builtin وC.UTF-8 — فيطابق
  # ترتيب الأسماء العربية في القوائم ما كان عليه، ولا يتغيّر مع ترقية glibc.
  pg_createcluster --start --encoding UTF8 --locale C.UTF-8 \
    "$PG_MAJOR" "$CLUSTER" -- --locale-provider=builtin --builtin-locale=C.UTF-8
fi

resolve_cluster --allow-offline
CONF_DIR="/etc/postgresql/$PG_MAJOR/$CLUSTER"
SERVICE="postgresql@$PG_MAJOR-$CLUSTER"
log "العنقود $PG_MAJOR/$CLUSTER على المنفذ $PG_PORT ($CONF_DIR)"

# ─────────────────────────── 3. مجلد المقبس ───────────────────────────

# على القرص لا على /run، فيبقى تركيب الحاويات له صالحًا عبر الإقلاع.
mkdir -p "$SOCKET_DIR"
chown postgres:postgres "$SOCKET_DIR"
# 2775: postgres يكتب المقبس، وغيره يعبر المجلد ولا ينشئ فيه شيئًا.
chmod 2775 "$SOCKET_DIR"

# ─────────────────────────── 4. الإعدادات ───────────────────────────

grep -qE "^[[:space:]]*include_dir[[:space:]]*=[[:space:]]*'conf\.d'" "$CONF_DIR/postgresql.conf" ||
  fail "$CONF_DIR/postgresql.conf بلا include_dir = 'conf.d' — ليس عنقودًا محزومًا من Debian/Ubuntu"

mkdir -p "$CONF_DIR/conf.d"
log "تثبيت $CONF_DIR/conf.d/greencities.conf"
install -o postgres -g postgres -m 644 "$HERE/greencities.conf" "$CONF_DIR/conf.d/greencities.conf"
sed -i "s|,/var/lib/greencities-pgsocket'|,$SOCKET_DIR'|" "$CONF_DIR/conf.d/greencities.conf"

# ───────────────────────── 5. المصادقة عبر المقبس ─────────────────────────

# القاعدة المحزومة `local all all peer` تقارن uid العملية باسم الدور. الحاويات
# تعمل بـ uid 1000 ولا مستخدم بهذا الرقم على المضيف، فـpeer لا ينجح أبدًا.
# قاعدة كلمة مرور لهذا الدور وحده، قبل القاعدة العامة، تحل ذلك دون إضعاف غيره.
HBA="$CONF_DIR/pg_hba.conf"
RULE="local   all             $DB_USER                                scram-sha-256"
if grep -qE "^local[[:space:]]+all[[:space:]]+$DB_USER[[:space:]]+scram-sha-256" "$HBA"; then
  log "pg_hba يسمح لـ$DB_USER عبر المقبس مسبقًا"
else
  log "إضافة قاعدة كلمة مرور لـ$DB_USER إلى pg_hba.conf"
  cp -a "$HBA" "$HBA.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  # قبل أول `local all all`: أول قاعدة مطابقة هي التي تحكم.
  awk -v rule="$RULE" '
    !done && /^local[[:space:]]+all[[:space:]]+all/ { print rule; done = 1 }
    { print }
    END { if (!done) print rule }
  ' "$HBA" > "$HBA.new"
  install -o postgres -g postgres -m 640 "$HBA.new" "$HBA"
  rm -f "$HBA.new"
fi

# ─────────────────────────── إعادة التشغيل ───────────────────────────

# shared_preload_libraries يحتاج إعادة تشغيل كاملة لا reload، وتُجرى قبل خطوات
# SQL كي يُنشأ امتداد الإحصاءات في المرة الأولى لا في الثانية.
log "إعادة تشغيل $SERVICE"
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"

for _ in $(seq 1 20); do
  [[ -S "$SOCKET_DIR/.s.PGSQL.$PG_PORT" ]] && break
  sleep 1
done
[[ -S "$SOCKET_DIR/.s.PGSQL.$PG_PORT" ]] ||
  fail "أُعيد التشغيل ولم يظهر مقبس في $SOCKET_DIR — journalctl -u $SERVICE -n 50"

# ──────────────────────── 6. الدور والقاعدة ────────────────────────

# كلمة المرور عبر stdin من printf — أمر مدمج في الصدفة — فلا تظهر في وسائط أي
# عملية. وSQL آمن لأن التحقق أعلاه حصرها في أحرف لا تكسر السلسلة.
if [[ "$(su_psql -tAc "select 1 from pg_roles where rolname = '$DB_USER'")" == 1 ]]; then
  log "الدور $DB_USER موجود — مطابقة كلمة مروره مع .env"
  printf "ALTER ROLE \"%s\" WITH LOGIN PASSWORD '%s';\n" "$DB_USER" "$DB_PASSWORD" | su_psql
else
  log "إنشاء الدور $DB_USER"
  printf "CREATE ROLE \"%s\" WITH LOGIN PASSWORD '%s';\n" "$DB_USER" "$DB_PASSWORD" | su_psql
fi

if [[ "$(su_psql -tAc "select 1 from pg_database where datname = '$DB_NAME'")" != 1 ]]; then
  log "إنشاء القاعدة $DB_NAME"
  su_psql -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
fi

# منذ PostgreSQL 15 لا يمنح مخطط public صلاحية الإنشاء للجميع. دور لا يملك
# القاعدة ومخططها لا يستطيع إنشاء جدول واحد — ولا تنجح ترحيلات drizzle.
su_psql -c "ALTER DATABASE \"$DB_NAME\" OWNER TO \"$DB_USER\";"
su_psql -d "$DB_NAME" -c "ALTER SCHEMA public OWNER TO \"$DB_USER\";"

# الإحصاءات في مخطط مستقل. وضعها في public هو الاختيار البديهي والخاطئ:
# الاستعادة تبدأ بـ DROP SCHEMA public CASCADE فتأخذ الامتداد معها بصمت.
log "إحصاءات الاستعلامات في مخطط extensions"
su_psql -d "$DB_NAME" \
  -c "CREATE SCHEMA IF NOT EXISTS extensions;" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA extensions;"

# ─────────────────────────── 7. التحقق ───────────────────────────

# المسار وكلمة المرور اللذان سيستعملهما الـAPI فعلًا، لا استنتاجًا من الإعدادات.
app_psql -tAc 'select 1' >/dev/null ||
  fail "$DB_USER لا يتصل عبر $SOCKET_DIR بكلمة مروره"
log "$DB_USER يتصل عبر $SOCKET_DIR بكلمة مروره"

su_psql -tAc "show shared_buffers" | sed 's/^/    shared_buffers: /'
su_psql -d "$DB_NAME" -tAc "select datlocprovider || ' ' || coalesce(datlocale, datcollate) from pg_database where datname = current_database()" |
  sed 's/^/    locale: /'
printf '    جداول التطبيق في %s: %s\n' "$DB_NAME" "$(table_count)"

# ─────────────────────────── تنبيهات الموارد ───────────────────────────

MEM_MB=$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)
SWAP_MB=$(awk '/^SwapTotal:/ {print int($2 / 1024)}' /proc/meminfo)
printf '    الذاكرة: %s MB، التبديل: %s MB\n' "$MEM_MB" "$SWAP_MB"
if [[ "$MEM_MB" -lt 2048 ]]; then
  log "تنبيه: أقل من 2 GB ذاكرة. القاعدة وبناء الصور عند النشر يتزاحمان — أضف تبديلًا"
elif [[ "$SWAP_MB" -eq 0 && "$MEM_MB" -lt 4096 ]]; then
  log "تنبيه: لا تبديل على خادم بأقل من 4 GB. بناء صورة عند النشر قد يُقتل لنفاد الذاكرة"
fi

cat <<INFO

جاهز. الخطوة التالية نقل البيانات:

  sudo ./migrate-from-neon.sh

ولا تغيّر deploy/.env قبل أن ينجح النقل: الـAPI ما زال يقرأ من Neon، والقاعدة
المحلية فارغة. migrate-from-neon.sh يطبع الأسطر بالضبط حين يحين وقتها.

INFO
