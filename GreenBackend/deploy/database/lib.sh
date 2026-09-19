# مساعدات مشتركة لسكربتات القاعدة. تُستورد لا تُنفَّذ:
#
#   . "$(dirname "$(readlink -f "$0")")/lib.sh"
#
# تقرأ .env المجاور، وتحدد العنقود ومنفذه وثنائيات الإصدار 18، وتوفّر طريقي
# الاتصال: المشرف عبر المقبس المحزوم، ودور التطبيق عبر المقبس الذي يركّبه
# الـAPI — لأن الثاني هو ما يجب إثبات عمله لا افتراضه.

HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

# shellcheck disable=SC1091
. "$HERE/load-env.sh"
[[ -r "$HERE/.env" ]] || {
  printf '✗ %s/.env غير موجود. انسخ النموذج ثم حرّره:\n  cp %s/.env.example %s/.env && chmod 600 %s/.env\n' \
    "$HERE" "$HERE" "$HERE" "$HERE" >&2
  exit 1
}
load_env "$HERE/.env"

PG_MAJOR=18
# الثنائيات بمسارها الكامل لا عبر pg_wrapper: على خادم فيه عناقيد بإصدارات
# أخرى يختار الغلاف إصدارًا بقواعد لا تظهر في الأمر، وpg_dump أقدم من
# الخادم يرفض العمل من أساسه.
PGBIN="/usr/lib/postgresql/$PG_MAJOR/bin"
CLUSTER="${PG_CLUSTER:-greencities}"
SOCKET_DIR="${PG_SOCKET_DIR:-/var/lib/greencities-pgsocket}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/greencities}"
COMPOSE_FILE="$HERE/../compose.prod.yml"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { printf '%s  ✗ %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

require_root() { [[ $EUID -eq 0 ]] || fail "شغّله بـ sudo"; }

require_db_settings() {
  : "${DB_NAME:?DB_NAME غير مضبوط في .env}"
  : "${DB_USER:?DB_USER غير مضبوط في .env}"
  # المعرّفات تدخل SQL وأسماء ملفات، فتُحصر في ما لا يحتاج تنصيصًا.
  [[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]*$ ]] ||
    fail "DB_NAME يقبل حروفًا لاتينية صغيرة وأرقامًا و_ فقط"
  [[ "$DB_USER" =~ ^[a-z_][a-z0-9_]*$ ]] ||
    fail "DB_USER يقبل حروفًا لاتينية صغيرة وأرقامًا و_ فقط"
  [[ "$CLUSTER" =~ ^[a-z_][a-z0-9_]*$ ]] ||
    fail "PG_CLUSTER يقبل حروفًا لاتينية صغيرة وأرقامًا و_ فقط"
}

# سطر العنقود من pg_lsclusters، أو لا شيء إن لم يوجد.
cluster_line() {
  command -v pg_lsclusters >/dev/null || return 0
  pg_lsclusters --no-header 2>/dev/null |
    awk -v v="$PG_MAJOR" -v c="$CLUSTER" '$1 == v && $2 == c'
}

# يضبط PG_PORT، ويفشل برسالة تقول ما العمل إن لم يُجهَّز العنقود بعد.
# `--allow-offline` لـsetup-native.sh وحده: هو من يشغّل العنقود المتوقف.
resolve_cluster() {
  local line
  line="$(cluster_line)"
  [[ -n "$line" ]] ||
    fail "العنقود $PG_MAJOR/$CLUSTER غير موجود — شغّل ./setup-native.sh أولًا"
  PG_PORT="$(awk '{print $3}' <<<"$line")"
  if [[ "${1:-}" != --allow-offline ]]; then
    [[ "$(awk '{print $4}' <<<"$line")" == online* ]] ||
      fail "العنقود $PG_MAJOR/$CLUSTER متوقف: systemctl start postgresql@$PG_MAJOR-$CLUSTER"
  fi
}

# المشرف عبر المقبس المحزوم وبمصادقة peer: لا كلمة مرور تمر بشيء.
su_psql() {
  sudo -u postgres "$PGBIN/psql" -h /var/run/postgresql -p "$PG_PORT" \
    -X -q -v ON_ERROR_STOP=1 "$@"
}

# دور التطبيق عبر المقبس الذي يركّبه الـAPI. كلمة المرور في البيئة لا في
# الوسائط: الوسائط تظهر في `ps` لكل مستخدم على الخادم، ومنهم مستخدم النشر.
app_env() {
  PGHOST="$SOCKET_DIR" PGPORT="$PG_PORT" PGUSER="$DB_USER" \
  PGPASSWORD="$DB_PASSWORD" PGDATABASE="$DB_NAME" PGSSLMODE=disable "$@"
}

app_psql() { app_env "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 "$@"; }

# نسخة من القاعدة الحالية بصيغة pg_dump المخصصة، تُكتب إلى ملف مؤقت ثم
# تُنقل: انقطاع في المنتصف لا يترك ملفًا يبدو نسخة صالحة.
dump_local() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  sudo -u postgres "$PGBIN/pg_dump" -h /var/run/postgresql -p "$PG_PORT" \
    -d "$DB_NAME" -Fc --no-owner --no-privileges -f "$target.partial" ||
    { rm -f "$target.partial"; return 1; }
  mv "$target.partial" "$target"
}

# يستبدل محتوى القاعدة بأرشيف pg_dump، حذفًا واستعادة في معاملة واحدة.
#
# لا حذف ثم استعادة: فشل الاستعادة يتراجع عن الحذف أيضًا، فتبقى البيانات
# السابقة كما هي. pg_restore يكتب SQL كاملًا إلى ملف أولًا — لا إلى أنبوب،
# لأن pg_restore يموت في منتصف الأنبوب يترك psql يلتزم بنصف قاعدة — ثم ينفّذ
# psql التمهيد والاستعادة معًا بين BEGIN وCOMMIT.
#
# ويُنفَّذ بصفة دور التطبيق: ما يُنشأ يملكه هو، فتعدّله ترحيلات drizzle
# لاحقًا. الاستعادة بصفة postgres كانت ستترك الجداول ملكًا له، ومع
# --no-privileges بلا أي منح — فيرفض الـAPI كل استعلام.
replace_from_archive() {
  local archive="$1" work toc status=0

  # الفهرس في متغير لا في أنبوب إلى `grep -q`: grep يخرج عند أول تطابق
  # فينكسر الأنبوب تحت pg_restore، ومع pipefail يُحسب الأنبوب فاشلًا رغم
  # التطابق — فيُضاف `CREATE SCHEMA public` مرتين وتسقط الاستعادة.
  toc="$("$PGBIN/pg_restore" --list "$archive")" || return 1

  work="$(mktemp -d)"
  chmod 700 "$work"

  printf '%s\n' \
    'DROP SCHEMA IF EXISTS drizzle CASCADE;' \
    'DROP SCHEMA IF EXISTS public CASCADE;' > "$work/prelude.sql"

  # هل ينشئ الأرشيف مخطط public بنفسه؟ يتوقف على كيف أُنشئ المصدر، والتخمين
  # الخاطئ يُسقط الاستعادة كلها، فالجواب من فهرس الأرشيف لا من افتراض.
  if ! grep -qE '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public' <<<"$toc"; then
    printf '%s\n' 'CREATE SCHEMA public;' >> "$work/prelude.sql"
  fi

  if "$PGBIN/pg_restore" --no-owner --no-privileges -f "$work/restore.sql" "$archive"; then
    app_psql --single-transaction -f "$work/prelude.sql" -f "$work/restore.sql" ||
      status=$?
  else
    status=$?
  fi

  rm -rf "$work"
  return "$status"
}

# عدد جداول التطبيق — لتقرير هل القاعدة فارغة.
table_count() {
  app_psql -tA -f "$HERE/sql/table-count.sql" | tr -d '[:space:]'
}

# الحاويات التي تكتب في القاعدة، بأسماء خدماتها في Compose.
running_writers() {
  docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null |
    grep -xE 'api|worker' || true
}
