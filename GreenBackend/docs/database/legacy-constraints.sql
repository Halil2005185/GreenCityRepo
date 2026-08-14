-- ═══════════════════════════════════════════════════════════════════════════
--  مرجع قديم غير تشغيلي — قيود المخطط السابق للمراجعة أثناء نقلها إلى Drizzle migrations.
--
--  لماذا هذا الملف؟
--  يحتوي على CHECK constraints وفهارس جزئية وفهارس تعبيرية وtriggers
--  يجب نقل المطلوب منها تدريجياً إلى ملفات Drizzle migrations المولدة.
--  بدون هذا الملف يبقى المخطط صحيحاً نحوياً لكنه يسمح ببيانات فاسدة:
--  شراكة مكررة حيّة، جهتا اتصال رئيسيتان، بريدان يختلفان بحالة الأحرف فقط…
--
--  لا يُطبّق هذا الملف تلقائياً ولا ينبغي تشغيله قبل نقل جداول المخطط القديم.
--
--  ملاحظة: يفترض PostgreSQL 15+ بسبب NULLS NOT DISTINCT.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────── 0) الإضافات ─────────────────────────────────
-- pg_trgm للبحث العربي الجزئي (ILIKE '%شجر%') — btree لا يخدمه إطلاقاً.
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ═══════════════════════════════════════════════════════════════════════════
--  1) الشراكات — أخطر قيد في المخطط كله
-- ═══════════════════════════════════════════════════════════════════════════

-- الميثاق: «يمكن أن يحمل الشريك أكثر من صفة شراكة».
-- إذن التكرار مسموح عبر الأنواع، وممنوع داخل النوع الواحد ما دامت الشراكة حيّة.
-- NULLS NOT DISTINCT ضرورية: بدونها تُعتبر كل شراكة برنامجية (initiative_id IS NULL)
-- مختلفة عن الأخرى، فيمكن إدراج «شريك تنفيذي» مرتين لنفس الجهة.
-- الشراكات المنتهية (ENDED) خارج القيد عمداً: التاريخ يجب أن يبقى قابلاً للتكرار.
CREATE UNIQUE INDEX IF NOT EXISTS partner_partnerships_live_uniq
  ON partner_partnerships (partner_id, type, initiative_id)
  NULLS NOT DISTINCT
  WHERE status IN ('PROPOSED', 'ACTIVE', 'PAUSED');

-- «شريك فعالية» مرتبط دائماً بنشاط محدد، وبقية الأنواع على مستوى البرنامج.
ALTER TABLE partner_partnerships
  DROP CONSTRAINT IF EXISTS partner_partnerships_event_scope_chk;
ALTER TABLE partner_partnerships
  ADD CONSTRAINT partner_partnerships_event_scope_chk CHECK (
    (type =  'EVENT' AND initiative_id IS NOT NULL) OR
    (type <> 'EVENT' AND initiative_id IS NULL)
  );

-- لا تنتهي شراكة قبل أن تبدأ.
ALTER TABLE partner_partnerships
  DROP CONSTRAINT IF EXISTS partner_partnerships_dates_chk;
ALTER TABLE partner_partnerships
  ADD CONSTRAINT partner_partnerships_dates_chk CHECK (
    ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on
  );


-- ═══════════════════════════════════════════════════════════════════════════
--  2) الشركاء — الظهور العام وجهات الاتصال
-- ═══════════════════════════════════════════════════════════════════════════

-- جهة اتصال رئيسية واحدة فقط لكل شريك (بين الجهات النشطة).
CREATE UNIQUE INDEX IF NOT EXISTS partner_contacts_one_primary_uniq
  ON partner_contacts (partner_id)
  WHERE is_primary AND ended_at IS NULL;

-- بريد الممثل فريد داخل الجهة، بلا حساسية لحالة الأحرف.
-- (email اختياري في المخطط، فنستثني الفارغ صراحةً.)
CREATE UNIQUE INDEX IF NOT EXISTS partner_contacts_email_ci_uniq
  ON partner_contacts (partner_id, lower(email))
  WHERE email IS NOT NULL AND ended_at IS NULL;

-- تاريخ سحب الموافقة لا يسبق منحها (الاسم والشعار موافقتان مستقلتان).
ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_consent_dates_chk;
ALTER TABLE partners
  ADD CONSTRAINT partners_consent_dates_chk CHECK (
    (public_name_consent_revoked_at IS NULL OR public_name_consent_at IS NULL
      OR public_name_consent_revoked_at >= public_name_consent_at) AND
    (public_logo_consent_revoked_at IS NULL OR public_logo_consent_at IS NULL
      OR public_logo_consent_revoked_at >= public_logo_consent_at)
  );

-- فهرس جدار الشركاء: يخدم الصفحة العامة /partners مباشرة.
-- جزئي لأن الجمهور لا يرى إلا الشركاء النشطين الموافقين على إظهار اسمهم.
CREATE INDEX IF NOT EXISTS partners_public_wall_idx
  ON partners (wall_tier, display_order, id)
  WHERE status = 'ACTIVE'
    AND deleted_at IS NULL
    AND suspended_at IS NULL
    AND hidden_from_wall = false
    AND public_name_consent = true
    AND public_name_consent_revoked_at IS NULL;

-- بحث عربي جزئي على اسم الشريك المُطبَّع.
CREATE INDEX IF NOT EXISTS partners_search_name_trgm_idx
  ON partners USING gin (search_name gin_trgm_ops);


-- ═══════════════════════════════════════════════════════════════════════════
--  3) الميثاق — إقرار حيّ واحد لكل (شريك، إصدار)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS charter_ack_live_uniq
  ON charter_acknowledgements (partner_id, charter_version_id)
  WHERE superseded_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
--  4) الحسابات والدعوات — البريد بلا حساسية لحالة الأحرف
-- ═══════════════════════════════════════════════════════════════════════════

-- users.email عليه @unique من Prisma، لكن 'Ali@x.com' و'ali@x.com' صفّان مختلفان.
-- نضمن التخزين بأحرف صغيرة بدل إضافة فهرس ثانٍ.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase_chk;
ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase_chk CHECK (email = lower(email));

-- دعوة معلّقة واحدة لكل بريد لكل جهة — وإلا وصلت دعوتان متضاربتان.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_uniq
  ON invitations (lower(email), partner_id)
  NULLS NOT DISTINCT
  WHERE status = 'PENDING';

-- بريد المتطوع اختياري، لكن إن وُجد فليكن فريداً بلا حساسية لحالة الأحرف.
CREATE UNIQUE INDEX IF NOT EXISTS volunteer_profiles_email_ci_uniq
  ON volunteer_profiles (lower(email))
  WHERE email IS NOT NULL AND redacted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
--  5) الجغرافيا والخريطة
-- ═══════════════════════════════════════════════════════════════════════════

-- الإحداثيات إما موجودة كاملة أو غائبة كاملة — لا نصف موقع.
ALTER TABLE initiatives DROP CONSTRAINT IF EXISTS initiatives_latlng_pair_chk;
ALTER TABLE initiatives
  ADD CONSTRAINT initiatives_latlng_pair_chk CHECK (
    (lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL)
  );

-- نطاق سوريا تقريبياً: يمسك خطأ عكس lat/lng وهو أشيع خطأ في إدخال الخرائط.
-- (نقطة في وسط المحيط تعني أن أحدهم بدّل المحورين.)
ALTER TABLE initiatives DROP CONSTRAINT IF EXISTS initiatives_syria_bbox_chk;
ALTER TABLE initiatives
  ADD CONSTRAINT initiatives_syria_bbox_chk CHECK (
    lat IS NULL OR (lat BETWEEN 32.0 AND 37.5 AND lng BETWEEN 35.5 AND 42.5)
  );

ALTER TABLE cities DROP CONSTRAINT IF EXISTS cities_syria_bbox_chk;
ALTER TABLE cities
  ADD CONSTRAINT cities_syria_bbox_chk CHECK (
    center_lat BETWEEN 32.0 AND 37.5 AND center_lng BETWEEN 35.5 AND 42.5
  );

-- ⭐ فهرس الخريطة — الاستعلام الأكثر سخونة في المنصة كلها.
-- جزئي: الخريطة لا تعرض إلا المنشور الذي يملك إحداثيات، وهي نسبة صغيرة
-- من الصفوف، فيبقى الفهرس صغيراً ويُقرأ من ذاكرة Neon بدل الـ pageserver.
CREATE INDEX IF NOT EXISTS initiatives_map_viewport_idx
  ON initiatives (lat, lng)
  WHERE publish_status = 'PUBLISHED'
    AND deleted_at IS NULL
    AND lat IS NOT NULL;

-- تماسك المدينة مع محافظتها: يمنع مبادرة في «حلب» تحت محافظة «درعا».
-- يحتاج مفتاحاً فريداً مركّباً على cities أولاً.
ALTER TABLE cities DROP CONSTRAINT IF EXISTS cities_id_governorate_uniq;
ALTER TABLE cities
  ADD CONSTRAINT cities_id_governorate_uniq UNIQUE (id, governorate_id);

ALTER TABLE initiatives DROP CONSTRAINT IF EXISTS initiatives_city_governorate_fk;
ALTER TABLE initiatives
  ADD CONSTRAINT initiatives_city_governorate_fk
  FOREIGN KEY (city_id, governorate_id)
  REFERENCES cities (id, governorate_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
--  6) الأثر — الأرقام لا تكذب
-- ═══════════════════════════════════════════════════════════════════════════

-- لا أعداد أشجار سالبة، والباقي على قيد الحياة لا يتجاوز المزروع.
ALTER TABLE initiatives DROP CONSTRAINT IF EXISTS initiatives_trees_sane_chk;
ALTER TABLE initiatives
  ADD CONSTRAINT initiatives_trees_sane_chk CHECK (
    (trees_expected  IS NULL OR trees_expected  >= 0) AND
    (trees_planted   IS NULL OR trees_planted   >= 0) AND
    (trees_surviving IS NULL OR trees_surviving >= 0) AND
    (trees_surviving IS NULL OR trees_planted IS NULL OR trees_surviving <= trees_planted)
  );

-- ملاحظة: منع الترحيل المزدوج مضمون أصلاً في المخطط عبر
-- @@unique([participationId, metricId]) على ImpactEntry، فلا حاجة لفهرس إضافي هنا.
-- القيمة المسجَّلة لا تكون سالبة إلا في قيد عكسي (reverses_entry_id).
ALTER TABLE impact_entries DROP CONSTRAINT IF EXISTS impact_entries_reversal_chk;
ALTER TABLE impact_entries
  ADD CONSTRAINT impact_entries_reversal_chk CHECK (
    value >= 0 OR reverses_entry_id IS NOT NULL
  );


-- ═══════════════════════════════════════════════════════════════════════════
--  7) المتطوعون — لا ازدواج في التقديم ولا في الحضور
-- ═══════════════════════════════════════════════════════════════════════════

-- طلب مفتوح واحد لكل متطوع لكل مبادرة/فعالية؛ الطلبات المُغلقة تتكرر بحرية.
CREATE UNIQUE INDEX IF NOT EXISTS volunteer_applications_open_uniq
  ON volunteer_applications (volunteer_profile_id, initiative_id, event_id)
  NULLS NOT DISTINCT
  WHERE status IN ('SUBMITTED', 'UNDER_REVIEW', 'WAITLISTED', 'ACCEPTED');

-- حضور واحد لكل متطوع في اليوم الواحد لكل فعالية — يمنع تضخيم ساعات التطوع.
CREATE UNIQUE INDEX IF NOT EXISTS participations_per_day_uniq
  ON participations (volunteer_profile_id, initiative_id, event_id, session_date)
  NULLS NOT DISTINCT;

-- الخروج بعد الدخول، والساعات غير سالبة.
ALTER TABLE participations DROP CONSTRAINT IF EXISTS participations_time_chk;
ALTER TABLE participations
  ADD CONSTRAINT participations_time_chk CHECK (
    (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
    AND (hours IS NULL OR hours >= 0)
  );


-- ═══════════════════════════════════════════════════════════════════════════
--  8) التقارير — سدّ تسريب البيانات بين الشركاء
-- ═══════════════════════════════════════════════════════════════════════════

-- scope_type إلزامي لكن كل مفاتيحه اختيارية، فيمكن إنشاء تقرير «خاص بشريك»
-- بلا partner_id فيُسلَّم للجميع. هذا القيد يجعل الحالة مستحيلة في القاعدة.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_scope_key_chk;
ALTER TABLE reports
  ADD CONSTRAINT reports_scope_key_chk CHECK (
    (scope_type = 'PROJECT'    AND partner_id IS NULL     AND city_id IS NULL AND initiative_id IS NULL) OR
    (scope_type = 'PARTNER'    AND partner_id IS NOT NULL AND city_id IS NULL AND initiative_id IS NULL) OR
    (scope_type = 'CITY'       AND city_id    IS NOT NULL AND partner_id IS NULL AND initiative_id IS NULL) OR
    (scope_type = 'INITIATIVE' AND initiative_id IS NOT NULL AND partner_id IS NULL AND city_id IS NULL)
  );

-- فترة التقرير منطقية.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_period_chk;
ALTER TABLE reports
  ADD CONSTRAINT reports_period_chk CHECK (
    period_end IS NULL OR period_start IS NULL OR period_end >= period_start
  );


-- ═══════════════════════════════════════════════════════════════════════════
--  9) السجل التدقيقي — إثبات لا يُعدَّل
-- ═══════════════════════════════════════════════════════════════════════════

-- AuditLog سجل إثباتي: لو أمكن تعديله أو حذفه فقد قيمته كدليل.
-- Prisma لا يمنع update/delete، فنمنعه في القاعدة نفسها.
CREATE OR REPLACE FUNCTION greencities_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'الجدول % سجل إثباتي غير قابل للتعديل أو الحذف', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION greencities_block_mutation();

-- فهرس جزئي للأحداث المهمة فقط — أرخص بكثير من فهرسة السجل كاملاً.
CREATE INDEX IF NOT EXISTS audit_logs_critical_idx
  ON audit_logs (created_at DESC)
  WHERE severity IN ('WARNING', 'CRITICAL');


-- ═══════════════════════════════════════════════════════════════════════════
--  10) البحث العربي على المبادرات
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS initiatives_search_trgm_idx
  ON initiatives USING gin (search_name gin_trgm_ops)
  WHERE deleted_at IS NULL;
