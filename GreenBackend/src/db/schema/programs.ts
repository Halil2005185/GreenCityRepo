import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps, tsColumn, uuidColumn } from './columns.js'
import {
  contributorKind,
  initiativeKind,
  initiativeStatus,
  siteStatus,
  targetRollup,
} from './enums.js'
import { areas } from './geo.js'
import { users } from './identity.js'
import { lookupValues } from './lookups.js'

/**
 * البرامج — صفوف لا قيم في enum.
 *
 * الوثائق تعدّد أربعة: التشجير، Green Point، مهندسو المدن، فرق المدن.
 * ومحضر 02-08 يطرح مبادرات لا تنتمي لأيّ منها بعد (ترميم المناطق
 * المحروقة، معالجة التربة). إضافة برنامج خامس يجب أن تكون إدخال صف.
 */
export const programs = pgTable(
  'programs',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 64 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    descriptionAr: text('description_ar'),

    defaultTargetRollup: targetRollup('default_target_rollup')
      .default('ADVISORY')
      .notNull(),

    /** إعدادات خاصة بالبرنامج دون توسيع المخطط لكل حالة. */
    settings: jsonb('settings')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),

    ...timestamps,
  },
  (table) => [uniqueIndex('programs_slug_unique').on(table.slug)],
)

/**
 * المبادرة — حملة 100 شجرة صف واحد هنا لا حالة خاصة في الكود.
 *
 * `targetRollup` يُنسخ من البرنامج عند الإنشاء ثم يستقل: مبادرتان تحت
 * البرنامج نفسه قد تختلفان في صرامة مطابقة الأهداف.
 */
export const initiatives = pgTable(
  'initiatives',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    programId: uuidColumn('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),

    kind: initiativeKind('kind').default('CAMPAIGN').notNull(),

    slug: varchar('slug', { length: 80 }),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    summaryAr: text('summary_ar'),
    /** نص التفاصيل الطويل لصفحة المبادرة — أقرب إلى مقال منه إلى حقل. */
    storyAr: text('story_ar'),

    /**
     * رابط صورة خارجي — حلّ مؤقت حتى يُبنى رفع الملفات.
     *
     * يُستبدل بمرجع إلى `media_assets` عندئذٍ، ووجوده الآن يجعل صفحة
     * المبادرة قابلة للعرض بدل انتظار وحدة التخزين كاملة.
     */
    coverImageUrl: varchar('cover_image_url', { length: 500 }),

    /**
     * منفّذ النقطة الخضراء كما يُكتب على صفحتها.
     *
     * حين يكون المنفّذ جهة مسجّلة لدينا يُربط أيضًا عبر `initiative_partners`
     * — الجدول موجود ويعبّر عن العلاقة نفسها، فلا داعي لمفتاح ثانٍ هنا
     * (ولا يمكن: `partners` يستورد هذا الملف، فالمفتاح المعاكس دورة).
     */
    contributorNameAr: varchar('contributor_name_ar', { length: 200 }),
    /** من تعريف `CONTRIBUTOR_KIND`؛ اختياري كما كان. */
    contributorKindId: uuidColumn('contributor_kind_id').references(
      () => lookupValues.id,
      { onDelete: 'restrict' },
    ),
    /** لقطة ما قبل «تعريفات النظام» — راجع `partners.legacyOrganizationKind`. */
    legacyContributorKind: contributorKind('contributor_kind'),

    /** موسم التنفيذ كنص حر: «خريف 2026» أو «موسم التشجير 2026». */
    season: varchar('season', { length: 80 }),
    status: initiativeStatus('status').default('DRAFT').notNull(),
    targetRollup: targetRollup('target_rollup').default('ADVISORY').notNull(),

    startsAt: tsColumn('starts_at'),
    endsAt: tsColumn('ends_at'),
    launchedAt: tsColumn('launched_at'),
    launchedById: uuidColumn('launched_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: tsColumn('completed_at'),

    leadUserId: uuidColumn('lead_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    internalNotesAr: text('internal_notes_ar'),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('initiatives_slug_unique')
      .on(table.slug)
      .where(sql`${table.slug} is not null`),
    index('initiatives_program_idx').on(table.programId),
    index('initiatives_status_idx').on(table.status),
    index('initiatives_contributor_kind_idx').on(table.contributorKindId),
    check(
      'initiatives_launch_consistency',
      sql`${table.status} <> 'ACTIVE' or ${table.launchedAt} is not null`,
    ),
    check(
      'initiatives_date_order',
      sql`${table.startsAt} is null or ${table.endsAt} is null
          or ${table.endsAt} >= ${table.startsAt}`,
    ),
    // النقطة الخضراء توثيق لفعل غيرنا، فلا معنى لها بلا منفّذ مسمّى.
    check(
      'initiatives_green_point_has_contributor',
      sql`${table.kind} <> 'GREEN_POINT' or ${table.contributorNameAr} is not null`,
    ),
  ],
)

/**
 * النطاق الجغرافي المُعلن أثناء التخطيط، قبل وجود مواقع.
 *
 * محضر 02-08 يكلّف العمليات بـ«التأكد من المناطق الثلاث الأولى» — أي أن
 * المناطق تُقرَّر قبل المواقع. بلا هذا الجدول لا مكان لتسجيل ذلك القرار
 * إلا في ملاحظة نصية.
 */
export const initiativeAreas = pgTable(
  'initiative_areas',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),
    areaId: uuidColumn('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    noteAr: text('note_ar'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('initiative_areas_unique').on(table.initiativeId, table.areaId),
    index('initiative_areas_area_idx').on(table.areaId),
  ],
)

/**
 * موقع تنفيذ. العدد مفتوح: صفر أثناء التخطيط، ثلاثة في الحملة التجريبية،
 * عشرات لاحقًا. لا شيء في المخطط ولا في الكود يفترض رقمًا.
 */
export const initiativeSites = pgTable(
  'initiative_sites',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    initiativeId: uuidColumn('initiative_id')
      .notNull()
      .references(() => initiatives.id, { onDelete: 'cascade' }),
    areaId: uuidColumn('area_id').references(() => areas.id, {
      onDelete: 'restrict',
    }),

    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    descriptionAr: text('description_ar'),
    status: siteStatus('status').default('PLANNED').notNull(),

    lat: numeric('lat', { precision: 9, scale: 6 }),
    lng: numeric('lng', { precision: 9, scale: 6 }),

    startsAt: tsColumn('starts_at'),
    endsAt: tsColumn('ends_at'),
    displayOrder: integer('display_order').default(0).notNull(),

    ...timestamps,
  },
  (table) => [
    index('initiative_sites_initiative_idx').on(table.initiativeId),
    index('initiative_sites_area_idx').on(table.areaId),
    check(
      'initiative_sites_coordinates_paired',
      sql`(${table.lat} is null) = (${table.lng} is null)`,
    ),
  ],
)

export type Program = typeof programs.$inferSelect
export type NewProgram = typeof programs.$inferInsert
export type Initiative = typeof initiatives.$inferSelect
export type NewInitiative = typeof initiatives.$inferInsert
export type InitiativeArea = typeof initiativeAreas.$inferSelect
export type InitiativeSite = typeof initiativeSites.$inferSelect
export type NewInitiativeSite = typeof initiativeSites.$inferInsert
