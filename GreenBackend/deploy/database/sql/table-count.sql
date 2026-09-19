-- عدد جداول التطبيق — لتقرير هل القاعدة الهدف فارغة.
--
-- `BASE TABLE` يستبعد العروض، و`extensions` مستثنى لأن pg_stat_statements
-- يعيش فيه. لا هذا ولا ذاك بيانات تطبيق، وعدّهما يجعل قاعدة فارغة تبدو ممتلئة.
SELECT count(*)
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'extensions')
  AND table_type = 'BASE TABLE';
