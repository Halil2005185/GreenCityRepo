-- ═══════════════════════════════════════════════════════════════════════
--  تهيئة قاعدة البيانات المحلية — المدن الخضراء
--
--  يُنفَّذ مرة واحدة بحساب مدير PostgreSQL:
--    psql -U postgres -f scripts/setup-local-db.sql
--
--  ⚠️ غيّر كلمة المرور أدناه قبل التنفيذ، وضع القيمة نفسها في DATABASE_URL
--     داخل ملف .env. لا تترك القيمة الافتراضية حتى في التطوير المحلي.
-- ═══════════════════════════════════════════════════════════════════════

\set app_password 'ضع-كلمة-مرور-قوية-هنا'

-- مستخدم التطبيق. لا يُستعمل حساب postgres داخل التطبيق إطلاقًا:
-- خطأ في استعلام بحساب مدير يمكنه إسقاط أي شيء في العنقود.
CREATE ROLE greencities_app WITH LOGIN PASSWORD :'app_password';

-- قاعدة التطوير.
CREATE DATABASE greencities OWNER greencities_app ENCODING 'UTF8';

-- قاعدة الاختبارات — منفصلة لأن الاختبارات تفرّغ الجداول بين كل اختبار،
-- وتشغيلها على قاعدة التطوير يمسح عملك.
CREATE DATABASE greencities_test OWNER greencities_app ENCODING 'UTF8';
