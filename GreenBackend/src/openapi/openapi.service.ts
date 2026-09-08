import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'

import { env } from '../config/env.js'
import { registry } from './registry.js'

/**
 * استيراد جانبي مقصود: تسجيل المسارات يحدث كأثر جانبي لتحميل ملفات
 * المخططات. أي وحدة جديدة تُضاف هنا وإلا غابت عن العقد رغم عملها.
 */
import '../modules/audit/audit.schemas.js'
import '../modules/auth/auth.schemas.js'
import '../modules/charter/charter.schemas.js'
import '../modules/dashboard/dashboard.schemas.js'
import '../modules/forms/forms.schemas.js'
import '../modules/forms/public.schemas.js'
import '../modules/forms/submissions.schemas.js'
import '../modules/geo/geo.schemas.js'
import '../modules/impact/impact.schemas.js'
import '../modules/initiatives/initiatives.schemas.js'
import '../modules/invitations/invitations.schemas.js'
import '../modules/map/map.schemas.js'
import '../modules/media/media.schemas.js'
import '../modules/metrics/metrics.schemas.js'
import '../modules/org/org.schemas.js'
import '../modules/partner-portal/portal.schemas.js'
import '../modules/partners/partners.schemas.js'
import '../modules/people/people.schemas.js'
import '../modules/programs/programs.schemas.js'
import '../modules/relations/relations.schemas.js'
import '../modules/uploads/uploads.schemas.js'
import '../modules/work/work.schemas.js'

let cachedDocument: Record<string, unknown> | null = null

/**
 * يُبنى مرة ويُخزَّن: التوليد يمر على كل المخططات، ولا شيء منها يتغير
 * بعد الإقلاع.
 */
export function buildOpenApiDocument() {
  cachedDocument ??= new OpenApiGeneratorV31(
    registry.definitions,
  ).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Green Cities API',
      version: '0.1.0',
      description:
        'واجهة نظام تشغيل المدن الخضراء. العقد مولَّد من مخططات Zod نفسها التي تتحقق من الطلبات وقت التشغيل، فلا ينفصل التوثيق عن السلوك.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Auth', description: 'المصادقة والجلسات والدعوات' },
      { name: 'Organization', description: 'المكاتب والأدوار وكتالوج القدرات' },
      { name: 'Invitations', description: 'إدارة دعوات أعضاء الفريق وممثلي الشركاء' },
      { name: 'Partners', description: 'سجل الشركاء ودورة الاعتماد' },
      { name: 'Charter', description: 'إصدارات الميثاق والإقرار به' },
      { name: 'Media', description: 'الشبكة الإعلامية: صنّاع المحتوى والإعلاميون ومتابعاتهم' },
      { name: 'Relations', description: 'مرجعيات العلاقات: أشكال العمل الإعلامي وأنواع العلاقة' },
      { name: 'Geography', description: 'التسلسل الجغرافي بكل مستوياته' },
      { name: 'Programs', description: 'البرامج التي تنضوي تحتها المبادرات' },
      { name: 'Metrics', description: 'كتالوج المؤشرات ووحداتها' },
      { name: 'Initiatives', description: 'المبادرات ومواقعها وأهدافها وبوابة بدء التنفيذ' },
      { name: 'Work', description: 'المراحل والمهام على أي نطاق' },
      { name: 'Impact', description: 'دفتر قيود الأثر والتقدم' },
      { name: 'Map', description: 'خريطة سورية: الحملات والنقاط الخضراء' },
      { name: 'Partner Portal', description: 'ما يراه ممثل الجهة الشريكة عن جهته' },
      { name: 'Dashboard', description: 'ملخّص لوحة المكتب' },
      { name: 'Audit', description: 'سجل التدقيق الإضافي فقط' },
      { name: 'Health', description: 'فحوص الجاهزية' },
    ],
  }) as unknown as Record<string, unknown>

  return cachedDocument
}

/** يُستدعى من سكربت التوليد ليكتب الملف على القرص لعميل الواجهة. */
export function openApiJson() {
  return JSON.stringify(buildOpenApiDocument(), null, 2)
}

export const openApiDocumentPath = `${env.API_PREFIX}/openapi.json`
