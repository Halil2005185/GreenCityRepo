import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { createdAtOnly, timestamps, tsColumn, uuidColumn } from './columns.js'
import { impactSource, metricAggregation } from './enums.js'
import { users } from './identity.js'
import { initiativeSites, initiatives, programs } from './programs.js'

/**
 * كتالوج المؤشرات — لا يوجد عمود `trees_planted` في أي جدول.
 *
 * هذا هو الفرق العملي بين نظام مقفل على حملة وآخر عام: إضافة «م² تربة
 * معالجة» أو «تصميم مُسلَّم» أو «نقطة خضراء موثّقة» إدخال صف، لا migration
 * ولا شاشة جديدة.
 */
export const metrics = pgTable(
  'metrics',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 64 }).notNull(),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    descriptionAr: text('description_ar'),

    /** وحدة القياس نصًّا: «شجرة» أو «م²» أو «ساعة». */
    unitAr: varchar('unit_ar', { length: 40 }).notNull(),

    aggregation: metricAggregation('aggregation').default('SUM').notNull(),
    /** خانات العرض العشرية؛ عدد الأشجار صفر، ومساحة التربة اثنتان. */
    decimals: integer('decimals').default(0).notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('metrics_slug_unique').on(table.slug),
    check(
      'metrics_decimals_range',
      sql`${table.decimals} between 0 and 6`,
    ),
  ],
)

/**
 * الهدف يُعلَّق على برنامج أو مبادرة أو موقع.
 *
 * ثلاثة أعمدة اختيارية بمفاتيح حقيقية بدل `scope_type`+`scope_id` العام:
 * العام لا يمكن للقاعدة أن تتحقق منه، فيبقى هدف معلّق على مبادرة محذوفة
 * يُحتسب في التقارير بلا مرجع. القيد يفرض عمودًا واحدًا بالضبط.
 */
export const metricTargets = pgTable(
  'metric_targets',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    metricId: uuidColumn('metric_id')
      .notNull()
      .references(() => metrics.id, { onDelete: 'restrict' }),

    programId: uuidColumn('program_id').references(() => programs.id, {
      onDelete: 'cascade',
    }),
    initiativeId: uuidColumn('initiative_id').references(() => initiatives.id, {
      onDelete: 'cascade',
    }),
    siteId: uuidColumn('site_id').references(() => initiativeSites.id, {
      onDelete: 'cascade',
    }),

    value: numeric('value', { precision: 16, scale: 4 }).notNull(),
    noteAr: text('note_ar'),

    ...timestamps,
  },
  (table) => [
    check(
      'metric_targets_single_scope',
      sql`num_nonnulls(${table.programId}, ${table.initiativeId}, ${table.siteId}) = 1`,
    ),
    check('metric_targets_non_negative', sql`${table.value} >= 0`),
    // هدف واحد لكل مؤشر في كل نطاق؛ التعديل تحديث لا صف ثانٍ.
    uniqueIndex('metric_targets_program_unique')
      .on(table.programId, table.metricId)
      .where(sql`${table.programId} is not null`),
    uniqueIndex('metric_targets_initiative_unique')
      .on(table.initiativeId, table.metricId)
      .where(sql`${table.initiativeId} is not null`),
    uniqueIndex('metric_targets_site_unique')
      .on(table.siteId, table.metricId)
      .where(sql`${table.siteId} is not null`),
    index('metric_targets_metric_idx').on(table.metricId),
  ],
)

/**
 * دفتر قيود الأثر — إضافي فقط.
 *
 * التصحيح قيد عكسي لا `UPDATE`: رقم الأثر يدخل التقارير التي تُرسل
 * للشركاء والداعمين، وتعديله في مكانه يجعل تقريرًا قديمًا غير قابل
 * للتفسير. القيد العكسي يبقي الأصل والتصحيح ظاهرين معًا.
 *
 * `verifiedAt` هو ما يفصل المُقدَّم عن المحتسَب: قيد من شريك لا يدخل
 * المجاميع قبل تحقق فريق إيفا.
 */
export const impactEntries = pgTable(
  'impact_entries',
  {
    id: uuidColumn('id').primaryKey().defaultRandom(),
    metricId: uuidColumn('metric_id')
      .notNull()
      .references(() => metrics.id, { onDelete: 'restrict' }),

    programId: uuidColumn('program_id').references(() => programs.id, {
      onDelete: 'cascade',
    }),
    initiativeId: uuidColumn('initiative_id').references(() => initiatives.id, {
      onDelete: 'cascade',
    }),
    siteId: uuidColumn('site_id').references(() => initiativeSites.id, {
      onDelete: 'cascade',
    }),

    value: numeric('value', { precision: 16, scale: 4 }).notNull(),
    source: impactSource('source').default('STAFF_ENTRY').notNull(),
    occurredAt: tsColumn('occurred_at').notNull(),
    noteAr: text('note_ar'),

    recordedById: uuidColumn('recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedAt: tsColumn('verified_at'),
    verifiedById: uuidColumn('verified_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** يشير إلى القيد الذي يعكسه. القيد العكسي نفسه لا يُعكَس. */
    reversalOfId: uuidColumn('reversal_of_id').references(
      (): AnyPgColumn => impactEntries.id,
      { onDelete: 'restrict' },
    ),

    /**
     * معرّف يولّده المُرسِل قبل الإرسال. الهاتف في الميدان يعيد الطلب حين
     * تنقطع الشبكة قبل وصول الجواب، ولا يعرف هل وصل الأول؛ بهذا المعرّف
     * يعود الصف الأصلي بدل أن تُسجَّل الأربعون شجرة مرتين.
     */
    clientId: uuidColumn('client_id'),

    ...createdAtOnly,
  },
  (table) => [
    check(
      'impact_entries_single_scope',
      sql`num_nonnulls(${table.programId}, ${table.initiativeId}, ${table.siteId}) = 1`,
    ),
    check(
      'impact_entries_verified_consistency',
      sql`(${table.verifiedAt} is null) = (${table.verifiedById} is null)`,
    ),
    // قيد عكسي واحد لكل قيد: العكس مرتين يعيد الأثر من حيث أُلغي.
    uniqueIndex('impact_entries_reversal_unique')
      .on(table.reversalOfId)
      .where(sql`${table.reversalOfId} is not null`),
    uniqueIndex('impact_entries_client_unique')
      .on(table.clientId)
      .where(sql`${table.clientId} is not null`),
    index('impact_entries_metric_idx').on(table.metricId),
    index('impact_entries_initiative_idx').on(table.initiativeId),
    index('impact_entries_site_idx').on(table.siteId),
    index('impact_entries_occurred_idx').on(table.occurredAt),
  ],
)

export type Metric = typeof metrics.$inferSelect
export type NewMetric = typeof metrics.$inferInsert
export type MetricTarget = typeof metricTargets.$inferSelect
export type NewMetricTarget = typeof metricTargets.$inferInsert
export type ImpactEntry = typeof impactEntries.$inferSelect
export type NewImpactEntry = typeof impactEntries.$inferInsert
