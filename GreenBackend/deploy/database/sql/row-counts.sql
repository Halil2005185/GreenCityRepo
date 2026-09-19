-- عدد صفوف دقيق لكل جدول، بصيغة "schema.table count".
--
-- `query_to_xml` يشغّل `count(*)` حقيقيًا لكل جدول داخل استعلام واحد، فالأرقام
-- دقيقة. البديل pg_stat_user_tables.n_live_tup تقدير لا عدّ، وقد يختلف بين
-- قاعدتين متطابقتين — فلا يصلح لإثبات أن النقل نسخ كل شيء.
--
-- `extensions` مستثنى: فيه جداول pg_stat_statements، وهي على الخادم المحلي
-- وحده فكانت ستظهر فرقًا وهميًا في كل مقارنة مع Neon.
SELECT table_schema || '.' || table_name || ' ' ||
       (xpath(
          '/row/c/text()',
          query_to_xml(
            format('select count(*) as c from %I.%I', table_schema, table_name),
            false, true, ''
          )
        ))[1]::text
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'extensions')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
