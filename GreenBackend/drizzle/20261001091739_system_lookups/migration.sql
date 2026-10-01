-- تعريفات النظام: الـenums الوصفية ومرجعيتا العلاقات تصير صفوفًا في
-- lookup_lists وlookup_values. معدّل يدويًا عمّا ولّده drizzle-kit:
--   1. التعريفات وقيمها تُدرج هنا لا في المزامنة، لأن db:deploy يرحّل قبل
--      أن يزامن، وملء الأعمدة الجديدة يطابق رمز القيمة بقيمة الـenum.
--   2. قيم أشكال العمل الإعلامي وأنواع العلاقة تُنسخ بمعرّفاتها، فما أشار
--      إليها يبقى صحيحًا ويتغير هدف المفتاح الأجنبي وحده.
--   3. الأعمدة الجديدة تُضاف فارغة، تُملأ، ثم تصير NOT NULL: قيمة enum بلا
--      مقابل تُفشل الترحيل كله بدل أن تمرّ صفًّا بلا تصنيف.
--   4. أعمدة الـenums والجدولان القديمان تبقى إصدارًا واحدًا شاهدةً على الترحيل.
CREATE TABLE "lookup_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" varchar(64) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"description_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lookup_lists_code_format" CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "lookup_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"list_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"description_ar" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lookup_values_code_format" CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lookup_lists_code_unique" ON "lookup_lists" ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "lookup_values_code_unique" ON "lookup_values" ("list_id","code");
--> statement-breakpoint
CREATE INDEX "lookup_values_order_idx" ON "lookup_values" ("list_id","display_order");
--> statement-breakpoint
ALTER TABLE "lookup_values" ADD CONSTRAINT "lookup_values_list_id_lookup_lists_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lookup_lists"("id") ON DELETE RESTRICT;
--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar") VALUES ('ORGANIZATION_KIND', 'نوع الجهة', 'فئة الجهة الشريكة: شركة، جمعية، جهة حكومية…');--> statement-breakpoint
INSERT INTO "lookup_values" ("list_id", "code", "name_ar", "name_en", "description_ar", "display_order")
SELECT l."id", v."code", v."name_ar", v."name_en", v."description_ar", v."display_order"
  FROM "lookup_lists" l,
  (VALUES
  ('COMPANY', 'شركة', 'Company', NULL, 10),
  ('NGO', 'جمعية أو منظمة أهلية', 'NGO', NULL, 20),
  ('GOVERNMENT', 'جهة حكومية أو بلدية', 'Government', NULL, 30),
  ('ACADEMIC', 'جهة أكاديمية', 'Academic', NULL, 40),
  ('VOLUNTEER_TEAM', 'فريق تطوعي', 'Volunteer team', NULL, 50),
  ('COMMUNITY_INITIATIVE', 'مبادرة مجتمعية', 'Community initiative', NULL, 60),
  ('DONOR', 'جهة مانحة', 'Donor', NULL, 70),
  ('INDIVIDUAL', 'فرد', 'Individual', NULL, 80),
  ('OTHER', 'أخرى', 'Other', NULL, 90)
  ) AS v("code", "name_ar", "name_en", "description_ar", "display_order")
 WHERE l."code" = 'ORGANIZATION_KIND';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar") VALUES ('SUPPORT_FORM', 'أشكال المشاركة والدعم', 'بأي شكل تدعم الجهة المشروع. البداية الأشكال السبعة كما وردت في الميثاق.');--> statement-breakpoint
INSERT INTO "lookup_values" ("list_id", "code", "name_ar", "name_en", "description_ar", "display_order")
SELECT l."id", v."code", v."name_ar", v."name_en", v."description_ar", v."display_order"
  FROM "lookup_lists" l,
  (VALUES
  ('MORAL_MEDIA', 'الدعم المعنوي والإعلامي', NULL, NULL, 10),
  ('COMMUNITY_VOLUNTEERING', 'المشاركة المجتمعية والتطوعية', NULL, NULL, 20),
  ('SPONSORSHIP_LOGISTICS', 'الرعاية أو الدعم اللوجستي', NULL, NULL, 30),
  ('TECHNICAL_ACADEMIC_EXPERTISE', 'تقديم الخبرات الفنية أو الأكاديمية', NULL, NULL, 40),
  ('ENVIRONMENTAL_AWARENESS', 'دعم الأنشطة البيئية والتوعوية', NULL, NULL, 50),
  ('INTERNAL_SUSTAINABILITY', 'تبني مبادرات استدامة داخل المؤسسة', NULL, NULL, 60),
  ('SPACES_AND_RESOURCES', 'توفير مساحات أو موارد', NULL, NULL, 70)
  ) AS v("code", "name_ar", "name_en", "description_ar", "display_order")
 WHERE l."code" = 'SUPPORT_FORM';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar") VALUES ('CONTACT_PRIORITY', 'أولوية التواصل', 'من نبدأ به حين يضيق الوقت. ترتيب القيم هو ترتيب الأهمية في فرز الإعلاميين.');--> statement-breakpoint
INSERT INTO "lookup_values" ("list_id", "code", "name_ar", "name_en", "description_ar", "display_order")
SELECT l."id", v."code", v."name_ar", v."name_en", v."description_ar", v."display_order"
  FROM "lookup_lists" l,
  (VALUES
  ('HIGH', 'عالية', 'High', NULL, 10),
  ('MEDIUM', 'متوسطة', 'Medium', NULL, 20),
  ('LOW', 'منخفضة', 'Low', NULL, 30)
  ) AS v("code", "name_ar", "name_en", "description_ar", "display_order")
 WHERE l."code" = 'CONTACT_PRIORITY';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar") VALUES ('ENGAGEMENT_HORIZON', 'أفق العلاقة', 'محور مستقل عن الأولوية: عاجل لمرة، أو مهم على المدى الطويل.');--> statement-breakpoint
INSERT INTO "lookup_values" ("list_id", "code", "name_ar", "name_en", "description_ar", "display_order")
SELECT l."id", v."code", v."name_ar", v."name_en", v."description_ar", v."display_order"
  FROM "lookup_lists" l,
  (VALUES
  ('LONG_TERM', 'مدى طويل', 'Long term', NULL, 10),
  ('SHORT_TERM', 'مدى قصير', 'Short term', NULL, 20),
  ('ONE_OFF', 'تعاون لمرة', 'One-off', NULL, 30)
  ) AS v("code", "name_ar", "name_en", "description_ar", "display_order")
 WHERE l."code" = 'ENGAGEMENT_HORIZON';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar") VALUES ('INTERACTION_KIND', 'نوع التواصل', 'ما يُسجَّل في سجل المتابعة: مكالمة، اجتماع، رسالة…');--> statement-breakpoint
INSERT INTO "lookup_values" ("list_id", "code", "name_ar", "name_en", "description_ar", "display_order")
SELECT l."id", v."code", v."name_ar", v."name_en", v."description_ar", v."display_order"
  FROM "lookup_lists" l,
  (VALUES
  ('CALL', 'مكالمة', 'Call', NULL, 10),
  ('MESSAGE', 'رسالة', 'Message', NULL, 20),
  ('EMAIL', 'بريد', 'Email', NULL, 30),
  ('MEETING', 'اجتماع', 'Meeting', NULL, 40),
  ('NOTE', 'ملاحظة', 'Note', NULL, 50),
  ('DOCUMENT_REQUEST', 'طلب مستند', 'Document request', NULL, 60),
  ('STAGE_CHANGE', 'تغيير مرحلة', 'Stage change', NULL, 70)
  ) AS v("code", "name_ar", "name_en", "description_ar", "display_order")
 WHERE l."code" = 'INTERACTION_KIND';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar") VALUES ('ACKNOWLEDGEMENT_METHOD', 'طريقة الإقرار بالميثاق', 'كيف وصل إقرار الجهة: حضوريًا، بالبريد، بمستند موقّع…');--> statement-breakpoint
INSERT INTO "lookup_values" ("list_id", "code", "name_ar", "name_en", "description_ar", "display_order")
SELECT l."id", v."code", v."name_ar", v."name_en", v."description_ar", v."display_order"
  FROM "lookup_lists" l,
  (VALUES
  ('IN_PERSON', 'حضوريًا', 'In person', NULL, 10),
  ('EMAIL', 'بالبريد الإلكتروني', 'Email', NULL, 20),
  ('PORTAL', 'عبر البوابة', 'Portal', NULL, 30),
  ('DOCUMENT', 'بمستند موقّع', 'Signed document', NULL, 40)
  ) AS v("code", "name_ar", "name_en", "description_ar", "display_order")
 WHERE l."code" = 'ACKNOWLEDGEMENT_METHOD';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar") VALUES ('CONTRIBUTOR_KIND', 'منفّذ النقطة الخضراء', 'من نفّذ النقطة الخضراء حين لا يكون شريكًا مسجّلًا.');--> statement-breakpoint
INSERT INTO "lookup_values" ("list_id", "code", "name_ar", "name_en", "description_ar", "display_order")
SELECT l."id", v."code", v."name_ar", v."name_en", v."description_ar", v."display_order"
  FROM "lookup_lists" l,
  (VALUES
  ('INDIVIDUAL', 'فرد', 'Individual', NULL, 10),
  ('COMPANY', 'شركة', 'Company', NULL, 20),
  ('INSTITUTION', 'مؤسسة', 'Institution', NULL, 30),
  ('SCHOOL', 'مدرسة أو جامعة', 'School or university', NULL, 40),
  ('VOLUNTEER_TEAM', 'فريق تطوعي', 'Volunteer team', NULL, 50),
  ('OTHER', 'أخرى', 'Other', NULL, 60)
  ) AS v("code", "name_ar", "name_en", "description_ar", "display_order")
 WHERE l."code" = 'CONTRIBUTOR_KIND';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar")
SELECT 'MEDIA_CHANNEL', 'شكل العمل الإعلامي', 'بأي شكل يعمل الشخص أو الجهة: سؤال شارع، ريبورتاج، بودكاست، تصوير.'
 WHERE EXISTS (SELECT 1 FROM "media_channels");--> statement-breakpoint
INSERT INTO "lookup_values" ("id", "list_id", "code", "name_ar", "name_en", "description_ar", "display_order", "is_active", "created_at", "updated_at")
SELECT c."id", l."id",
       CASE WHEN upper(replace(c."slug", '-', '_')) ~ '^[A-Z]'
            THEN upper(replace(c."slug", '-', '_'))
            ELSE 'V_' || upper(replace(c."slug", '-', '_')) END,
       c."name_ar", c."name_en", c."description_ar", c."display_order", c."is_active", c."created_at", c."updated_at"
  FROM "media_channels" c
  JOIN "lookup_lists" l ON l."code" = 'MEDIA_CHANNEL';--> statement-breakpoint
INSERT INTO "lookup_lists" ("code", "name_ar", "description_ar")
SELECT 'RELATIONSHIP_TYPE', 'نوع العلاقة', 'طبيعة العلاقة عمليًا: تعاون تطوعي، تغطية، تبادل منفعة. غير نوع الشراكة الذي يحدده الميثاق.'
 WHERE EXISTS (SELECT 1 FROM "relationship_types");--> statement-breakpoint
INSERT INTO "lookup_values" ("id", "list_id", "code", "name_ar", "name_en", "description_ar", "display_order", "is_active", "created_at", "updated_at")
SELECT c."id", l."id",
       CASE WHEN upper(replace(c."slug", '-', '_')) ~ '^[A-Z]'
            THEN upper(replace(c."slug", '-', '_'))
            ELSE 'V_' || upper(replace(c."slug", '-', '_')) END,
       c."name_ar", c."name_en", c."description_ar", c."display_order", c."is_active", c."created_at", c."updated_at"
  FROM "relationship_types" c
  JOIN "lookup_lists" l ON l."code" = 'RELATIONSHIP_TYPE';
--> statement-breakpoint
CREATE TABLE "partner_support_forms" (
	"partner_id" uuid,
	"value_id" uuid,
	CONSTRAINT "partner_support_forms_pkey" PRIMARY KEY("partner_id","value_id")
);
--> statement-breakpoint
ALTER TABLE "partner_media_channels" DROP CONSTRAINT "partner_media_channels_channel_id_media_channels_id_fkey";
--> statement-breakpoint
ALTER TABLE "partners" DROP CONSTRAINT "partners_relationship_type_id_relationship_types_id_fkey";
--> statement-breakpoint
ALTER TABLE "media_contact_channels" DROP CONSTRAINT "media_contact_channels_channel_id_media_channels_id_fkey";
--> statement-breakpoint
ALTER TABLE "media_contacts" DROP CONSTRAINT "media_contacts_relationship_type_id_relationship_types_id_fkey";
--> statement-breakpoint
ALTER TABLE "initiatives" ADD COLUMN "contributor_kind_id" uuid;
--> statement-breakpoint
ALTER TABLE "partner_interactions" ADD COLUMN "kind_id" uuid;
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "organization_kind_id" uuid;
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "contact_priority_id" uuid;
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "engagement_horizon_id" uuid;
--> statement-breakpoint
ALTER TABLE "media_contact_interactions" ADD COLUMN "kind_id" uuid;
--> statement-breakpoint
ALTER TABLE "media_contacts" ADD COLUMN "priority_id" uuid;
--> statement-breakpoint
ALTER TABLE "media_contacts" ADD COLUMN "horizon_id" uuid;
--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ADD COLUMN "method_id" uuid;
--> statement-breakpoint
UPDATE "partners" p SET
  "organization_kind_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'ORGANIZATION_KIND' AND v."code" = p."organization_kind"::text),
  "contact_priority_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'CONTACT_PRIORITY' AND v."code" = p."contact_priority"::text),
  "engagement_horizon_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'ENGAGEMENT_HORIZON' AND v."code" = p."engagement_horizon"::text);
--> statement-breakpoint
INSERT INTO "partner_support_forms" ("partner_id", "value_id")
SELECT DISTINCT p."id", v."id"
  FROM "partners" p
  CROSS JOIN LATERAL unnest(p."support_forms") AS f("form")
  JOIN "lookup_lists" l ON l."code" = 'SUPPORT_FORM'
  JOIN "lookup_values" v ON v."list_id" = l."id" AND v."code" = f."form"::text;
--> statement-breakpoint
UPDATE "partner_interactions" i SET
  "kind_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'INTERACTION_KIND' AND v."code" = i."kind"::text);
--> statement-breakpoint
UPDATE "media_contact_interactions" i SET
  "kind_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'INTERACTION_KIND' AND v."code" = i."kind"::text);
--> statement-breakpoint
UPDATE "media_contacts" c SET
  "priority_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'CONTACT_PRIORITY' AND v."code" = c."priority"::text),
  "horizon_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'ENGAGEMENT_HORIZON' AND v."code" = c."horizon"::text);
--> statement-breakpoint
UPDATE "charter_acknowledgements" a SET
  "method_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'ACKNOWLEDGEMENT_METHOD' AND v."code" = a."method"::text);
--> statement-breakpoint
UPDATE "initiatives" i SET
  "contributor_kind_id" = (SELECT v."id" FROM "lookup_values" v JOIN "lookup_lists" l ON l."id" = v."list_id"
     WHERE l."code" = 'CONTRIBUTOR_KIND' AND v."code" = i."contributor_kind"::text)
 WHERE i."contributor_kind" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "organization_kind_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "contact_priority_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "partner_interactions" ALTER COLUMN "kind_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_contact_interactions" ALTER COLUMN "kind_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_contacts" ALTER COLUMN "priority_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ALTER COLUMN "method_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "partner_interactions" ALTER COLUMN "kind" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "organization_kind" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "support_forms" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "support_forms" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "contact_priority" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "contact_priority" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_contact_interactions" ALTER COLUMN "kind" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_contacts" ALTER COLUMN "priority" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "media_contacts" ALTER COLUMN "priority" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ALTER COLUMN "method" DROP NOT NULL;
--> statement-breakpoint
DROP INDEX "media_contacts_priority_idx";
--> statement-breakpoint
CREATE INDEX "media_contacts_priority_idx" ON "media_contacts" ("priority_id");
--> statement-breakpoint
CREATE INDEX "initiatives_contributor_kind_idx" ON "initiatives" ("contributor_kind_id");
--> statement-breakpoint
CREATE INDEX "partner_interactions_kind_idx" ON "partner_interactions" ("kind_id");
--> statement-breakpoint
CREATE INDEX "partner_support_forms_value_idx" ON "partner_support_forms" ("value_id");
--> statement-breakpoint
CREATE INDEX "partners_organization_kind_idx" ON "partners" ("organization_kind_id");
--> statement-breakpoint
CREATE INDEX "partners_contact_priority_idx" ON "partners" ("contact_priority_id");
--> statement-breakpoint
CREATE INDEX "partners_relationship_type_idx" ON "partners" ("relationship_type_id");
--> statement-breakpoint
CREATE INDEX "media_contact_interactions_kind_idx" ON "media_contact_interactions" ("kind_id");
--> statement-breakpoint
CREATE INDEX "media_contacts_relationship_type_idx" ON "media_contacts" ("relationship_type_id");
--> statement-breakpoint
CREATE INDEX "charter_acknowledgements_method_idx" ON "charter_acknowledgements" ("method_id");
--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_contributor_kind_id_lookup_values_id_fkey" FOREIGN KEY ("contributor_kind_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "partner_interactions" ADD CONSTRAINT "partner_interactions_kind_id_lookup_values_id_fkey" FOREIGN KEY ("kind_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "partner_media_channels" ADD CONSTRAINT "partner_media_channels_channel_id_lookup_values_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "partner_support_forms" ADD CONSTRAINT "partner_support_forms_partner_id_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "partner_support_forms" ADD CONSTRAINT "partner_support_forms_value_id_lookup_values_id_fkey" FOREIGN KEY ("value_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_organization_kind_id_lookup_values_id_fkey" FOREIGN KEY ("organization_kind_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_relationship_type_id_lookup_values_id_fkey" FOREIGN KEY ("relationship_type_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_contact_priority_id_lookup_values_id_fkey" FOREIGN KEY ("contact_priority_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_engagement_horizon_id_lookup_values_id_fkey" FOREIGN KEY ("engagement_horizon_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "media_contact_channels" ADD CONSTRAINT "media_contact_channels_channel_id_lookup_values_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "media_contact_interactions" ADD CONSTRAINT "media_contact_interactions_kind_id_lookup_values_id_fkey" FOREIGN KEY ("kind_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "media_contacts" ADD CONSTRAINT "media_contacts_priority_id_lookup_values_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "media_contacts" ADD CONSTRAINT "media_contacts_horizon_id_lookup_values_id_fkey" FOREIGN KEY ("horizon_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "media_contacts" ADD CONSTRAINT "media_contacts_relationship_type_id_lookup_values_id_fkey" FOREIGN KEY ("relationship_type_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "charter_acknowledgements" ADD CONSTRAINT "charter_acknowledgements_method_id_lookup_values_id_fkey" FOREIGN KEY ("method_id") REFERENCES "lookup_values"("id") ON DELETE RESTRICT;
