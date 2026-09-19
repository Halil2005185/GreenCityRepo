# يقرأ ملف KEY=VALUE إلى البيئة دون أن يُنفّذه.
#
# `set -a; . ./.env` الاختصار المعتاد وهو خطأ هنا: الملف يحمل روابط اتصال،
# والصدفة تقرؤها كودًا. رابط Neon ينتهي بـ`...&channel_binding=require`، فيصير
# الإسناد مهمة في الخلفية — المتغير يُضبط في صدفة فرعية ويبقى فارغًا عندنا.
# والفشل صامت يبدو تمامًا كقيمة ناقصة.
#
# ومثله أي قيمة فيها $ ` ; ( ) أو مسافات، ككلمة مرور. قراءة السطر بأنفسنا
# تتجاوز ذلك كله.
#
# الاستعمال:  . ./load-env.sh; load_env ./.env

load_env() {
  local file="$1" line key value
  [[ -r "$file" ]] || { printf 'ERROR: cannot read %s\n' "$file" >&2; return 1; }

  while IFS= read -r line || [[ -n "$line" ]]; do
    # التعليقات والأسطر الفارغة وما ليس إسنادًا.
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *=* ]] || continue

    key="${line%%=*}"
    value="${line#*=}"

    # المسافات حول المفتاح، و`export` في أوله إن وُجد.
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#export }"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    # ملف حُرّر على Windows يحمل CR في آخر كل سطر، فيصير جزءًا من القيمة.
    value="${value%$'\r'}"

    # والمسافات حول القيمة: `KEY = 7` كان يعطي " 7"، و`find -mtime +" 7"`
    # يفشل برسالة لا تشير إلى الملف. لا قيمة هنا تبدأ أو تنتهي بمسافة عن قصد.
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    # طبقة واحدة من علامات التنصيص المتطابقة، فيعمل الأسلوبان.
    if [[ ${#value} -ge 2 ]]; then
      case "$value" in
        \'*\') value="${value:1:${#value}-2}" ;;
        \"*\") value="${value:1:${#value}-2}" ;;
      esac
    fi

    # printf -v يُسند دون أي تفسير إضافي للقيمة.
    printf -v "$key" '%s' "$value"
    export "${key?}"
  done < "$file"
}
