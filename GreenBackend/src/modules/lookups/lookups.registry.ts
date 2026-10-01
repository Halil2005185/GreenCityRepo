import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'

import { charterAcknowledgements } from '../../db/schema/charter.js'
import {
  mediaContactChannels,
  mediaContactInteractions,
  mediaContacts,
} from '../../db/schema/media.js'
import {
  partnerInteractions,
  partnerMediaChannels,
  partnerSupportForms,
  partners,
} from '../../db/schema/partners.js'
import { initiatives } from '../../db/schema/programs.js'
import {
  ACKNOWLEDGEMENT_METHOD_SEEDS,
  CONTACT_PRIORITY_SEEDS,
  CONTRIBUTOR_KIND_SEEDS,
  ENGAGEMENT_HORIZON_SEEDS,
  INTERACTION_KIND_SEEDS,
  type LookupSeed,
  MEDIA_CHANNEL_SEEDS,
  ORGANIZATION_KIND_SEEDS,
  RELATIONSHIP_TYPE_SEEDS,
  SUPPORT_FORM_SEEDS,
} from '../../db/seed-lookups.js'
import type { Capability } from '../access/capabilities.js'

/**
 * سجل تعريفات النظام — الجزء الذي يبقى كودًا منها.
 *
 * القاعدة تملك اسم التعريف وقيمه، والكود يملك ما يربطها بالنظام: الأعمدة
 * التي تشير إليها، ومن يحرّر قيمها، والقيم القليلة التي يكتبها الكود
 * بنفسه. لذلك لا يُنشأ تعريف من اللوحة: تعريف بلا عمود يشير إليه قائمة لا
 * تظهر في أي شاشة.
 *
 * إضافة تعريف جديد: رمز هنا، وعمود بمفتاح أجنبي `restrict` إلى
 * `lookup_values`، ومدخل في `usages`، ثم `<LookupSelect code="…" />` في
 * الواجهة.
 */
export const LOOKUP_CODES = [
  'ORGANIZATION_KIND',
  'SUPPORT_FORM',
  'CONTACT_PRIORITY',
  'ENGAGEMENT_HORIZON',
  'RELATIONSHIP_TYPE',
  'MEDIA_CHANNEL',
  'INTERACTION_KIND',
  'ACKNOWLEDGEMENT_METHOD',
  'CONTRIBUTOR_KIND',
] as const

export type LookupCode = (typeof LOOKUP_CODES)[number]

type LookupUsage = {
  table: PgTable
  column: AnyPgColumn
  /** ما يظهر في رسالة رفض الحذف: «مستخدمة في 14 من الشركاء». */
  labelAr: string
}

type LookupDefinition = {
  nameAr: string
  descriptionAr: string
  /** عنوان المجموعة في شاشة التعريفات. */
  groupAr: string
  /**
   * من يحرّر القيم، إضافة إلى حامل `lookups.manage`: من يملك تعديل السجلات
   * التي تستعمل التعريف. هو من يحتاج القيمة الجديدة لحظة إدخال السجل،
   * فيضيفها من زر «+» في القائمة نفسها بدل أن ينتظر من يملك الإعدادات.
   */
  editors: readonly Capability[]
  usages: readonly LookupUsage[]
  /**
   * قيم يشير إليها الكود برمزها: تُعدَّل تسميتها، ولا تُعطَّل ولا تُحذف.
   * غيابها يكسر مسارًا قائمًا — `MEDIUM` مثلًا هي أولوية الجهة حين لا تُرسل.
   */
  lockedCodes?: readonly string[]
  /**
   * قيم يكتبها النظام وحده: مقفلة، ولا تظهر في قوائم الاختيار، ويرفضها
   * الخادم من المستخدم. «تغيير مرحلة» سجلٌّ يتركه نقل المرحلة، لا تواصل
   * يسجّله أحد بيده.
   */
  systemCodes?: readonly string[]
  seeds: readonly LookupSeed[]
}

const RELATIONS_EDITORS = [
  'relations.taxonomy.manage',
  'partners.manage',
  'media.manage',
] as const satisfies readonly Capability[]

export const LOOKUP_REGISTRY = {
  ORGANIZATION_KIND: {
    nameAr: 'نوع الجهة',
    descriptionAr: 'فئة الجهة الشريكة: شركة، جمعية، جهة حكومية…',
    groupAr: 'الشركاء',
    editors: ['partners.manage'],
    usages: [
      {
        table: partners,
        column: partners.organizationKindId,
        labelAr: 'من الشركاء',
      },
    ],
    seeds: ORGANIZATION_KIND_SEEDS,
  },
  SUPPORT_FORM: {
    nameAr: 'أشكال المشاركة والدعم',
    descriptionAr:
      'بأي شكل تدعم الجهة المشروع. البداية الأشكال السبعة كما وردت في الميثاق.',
    groupAr: 'الشركاء',
    editors: ['partners.manage'],
    usages: [
      {
        table: partnerSupportForms,
        column: partnerSupportForms.valueId,
        labelAr: 'من الشركاء',
      },
    ],
    seeds: SUPPORT_FORM_SEEDS,
  },
  CONTACT_PRIORITY: {
    nameAr: 'أولوية التواصل',
    descriptionAr:
      'من نبدأ به حين يضيق الوقت. ترتيب القيم هو ترتيب الأهمية في فرز الإعلاميين.',
    groupAr: 'العلاقات والإعلام',
    editors: RELATIONS_EDITORS,
    usages: [
      {
        table: partners,
        column: partners.contactPriorityId,
        labelAr: 'من الشركاء',
      },
      {
        table: mediaContacts,
        column: mediaContacts.priorityId,
        labelAr: 'من الإعلاميين',
      },
    ],
    lockedCodes: ['MEDIUM'],
    seeds: CONTACT_PRIORITY_SEEDS,
  },
  ENGAGEMENT_HORIZON: {
    nameAr: 'أفق العلاقة',
    descriptionAr: 'محور مستقل عن الأولوية: عاجل لمرة، أو مهم على المدى الطويل.',
    groupAr: 'العلاقات والإعلام',
    editors: RELATIONS_EDITORS,
    usages: [
      {
        table: partners,
        column: partners.engagementHorizonId,
        labelAr: 'من الشركاء',
      },
      {
        table: mediaContacts,
        column: mediaContacts.horizonId,
        labelAr: 'من الإعلاميين',
      },
    ],
    seeds: ENGAGEMENT_HORIZON_SEEDS,
  },
  RELATIONSHIP_TYPE: {
    nameAr: 'نوع العلاقة',
    descriptionAr:
      'طبيعة العلاقة عمليًا: تعاون تطوعي، تغطية، تبادل منفعة. غير نوع الشراكة الذي يحدده الميثاق.',
    groupAr: 'العلاقات والإعلام',
    editors: RELATIONS_EDITORS,
    usages: [
      {
        table: partners,
        column: partners.relationshipTypeId,
        labelAr: 'من الشركاء',
      },
      {
        table: mediaContacts,
        column: mediaContacts.relationshipTypeId,
        labelAr: 'من الإعلاميين',
      },
    ],
    seeds: RELATIONSHIP_TYPE_SEEDS,
  },
  MEDIA_CHANNEL: {
    nameAr: 'شكل العمل الإعلامي',
    descriptionAr:
      'بأي شكل يعمل الشخص أو الجهة: سؤال شارع، ريبورتاج، بودكاست، تصوير.',
    groupAr: 'العلاقات والإعلام',
    editors: RELATIONS_EDITORS,
    usages: [
      {
        table: partnerMediaChannels,
        column: partnerMediaChannels.channelId,
        labelAr: 'من الشركاء',
      },
      {
        table: mediaContactChannels,
        column: mediaContactChannels.channelId,
        labelAr: 'من الإعلاميين',
      },
    ],
    seeds: MEDIA_CHANNEL_SEEDS,
  },
  INTERACTION_KIND: {
    nameAr: 'نوع التواصل',
    descriptionAr: 'ما يُسجَّل في سجل المتابعة: مكالمة، اجتماع، رسالة…',
    groupAr: 'العلاقات والإعلام',
    editors: RELATIONS_EDITORS,
    usages: [
      {
        table: partnerInteractions,
        column: partnerInteractions.kindId,
        labelAr: 'من متابعات الشركاء',
      },
      {
        table: mediaContactInteractions,
        column: mediaContactInteractions.kindId,
        labelAr: 'من متابعات الإعلاميين',
      },
    ],
    systemCodes: ['STAGE_CHANGE'],
    seeds: INTERACTION_KIND_SEEDS,
  },
  ACKNOWLEDGEMENT_METHOD: {
    nameAr: 'طريقة الإقرار بالميثاق',
    descriptionAr: 'كيف وصل إقرار الجهة: حضوريًا، بالبريد، بمستند موقّع…',
    groupAr: 'الميثاق',
    editors: ['charter.acknowledgements.record'],
    usages: [
      {
        table: charterAcknowledgements,
        column: charterAcknowledgements.methodId,
        labelAr: 'من إقرارات الميثاق',
      },
    ],
    seeds: ACKNOWLEDGEMENT_METHOD_SEEDS,
  },
  CONTRIBUTOR_KIND: {
    nameAr: 'منفّذ النقطة الخضراء',
    descriptionAr: 'من نفّذ النقطة الخضراء حين لا يكون شريكًا مسجّلًا.',
    groupAr: 'الخريطة',
    editors: ['initiatives.manage'],
    usages: [
      {
        table: initiatives,
        column: initiatives.contributorKindId,
        labelAr: 'من النقاط الخضراء',
      },
    ],
    seeds: CONTRIBUTOR_KIND_SEEDS,
  },
} as const satisfies Record<LookupCode, LookupDefinition>

const DEFINITIONS: Record<LookupCode, LookupDefinition> = LOOKUP_REGISTRY

export function lookupDefinition(code: LookupCode): LookupDefinition {
  return DEFINITIONS[code]
}

export function isLookupCode(value: string): value is LookupCode {
  return (LOOKUP_CODES as readonly string[]).includes(value)
}

export function isSystemValue(list: LookupCode, valueCode: string): boolean {
  return DEFINITIONS[list].systemCodes?.includes(valueCode) ?? false
}

/** القيمة المقفلة لا تُعطَّل ولا تُحذف؛ قيم النظام مقفلة كلها. */
export function isLockedValue(list: LookupCode, valueCode: string): boolean {
  return (
    isSystemValue(list, valueCode) ||
    (DEFINITIONS[list].lockedCodes?.includes(valueCode) ?? false)
  )
}

/** هل يحرّر هذا المستخدم قيم التعريف — من الإعدادات أو من زر «+». */
export function canEditLookup(
  list: LookupCode,
  capabilities: readonly string[],
): boolean {
  return (
    capabilities.includes('lookups.manage') ||
    DEFINITIONS[list].editors.some((capability) =>
      capabilities.includes(capability),
    )
  )
}
