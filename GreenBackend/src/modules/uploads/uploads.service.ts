import { randomUUID } from 'node:crypto'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { errors } from '../../common/errors/app-error.js'
import { env } from '../../config/env.js'
import type { UploadPurpose } from './uploads.schemas.js'

/**
 * أنواع الملفات المسموحة وامتداداتها.
 *
 * قائمة سماح لا قائمة منع: نوع لم يُذكر هنا يُرفض. والامتداد يُشتقّ من
 * النوع لا من اسم الملف الذي أرسله المتصفح — اسم الملف نصّ يكتبه من يرفع،
 * و`ملف.jpg.svg` مرّ من فحوص كثيرة قبلنا.
 */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** خمسة ميغابايت: صورة غلاف لا أرشيف. والحدّ يُوقَّع فيلزم المتصفح. */
const MAX_BYTES = 5 * 1024 * 1024

/** مجلّد لكل غرض: يجعل السطل مقروءًا، ويسمح بسياسة عمر مختلفة لاحقًا. */
const PREFIXES: Record<UploadPurpose, string> = {
  FORM_COVER: 'forms/covers',
  INITIATIVE_COVER: 'initiatives/covers',
  GREEN_POINT_COVER: 'green-points/covers',
}

type Storage = {
  client: S3Client
  bucket: string
  publicBaseUrl: string
}

let storage: Storage | null = null

/**
 * يُبنى عند أول استعمال لا عند الإقلاع.
 *
 * الخادم يجب أن يقلع بلا مفاتيح تخزين — جهاز تطوير أو بيئة اختبار لا
 * ينبغي أن تتوقف على سحابة. وما ينقص يُقال عند الطلب لا يُخفى: «التخزين
 * غير مهيّأ» أوضح من رفعٍ يفشل بلا سبب.
 */
function requireStorage(): Storage {
  if (storage) return storage

  const {
    R2_ACCOUNT_ID: accountId,
    R2_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_PUBLIC_BASE_URL: publicBaseUrl,
  } = env

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw errors.unprocessable(
      'تخزين الملفات غير مهيّأ على هذا الخادم. اضبط متغيّرات R2 أولًا.',
    )
  }

  storage = {
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ''),
    client: new S3Client({
      // R2 لا مناطق فيه، و`auto` هي ما توقّعه أدوات S3 عليه.
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },

      /**
       * بلا مجموع تحقّق تلقائي.
       *
       * الإعداد الافتراضي يحسب CRC32 وقت التوقيع ويضعه في الرابط — ووقت
       * التوقيع لا جسم للطلب، فيخرج مجموع الفراغ `AAAAAA==`. ثم يرفع
       * المتصفح الملف الحقيقي فلا يطابق ما وُقّع عليه، فيُردّ الرفع.
       */
      requestChecksumCalculation: 'WHEN_REQUIRED',
    }),
  }

  return storage
}

/** للاختبار: يُنسي التهيئة المحفوظة بين الحالات. */
export function resetStorage() {
  storage = null
}

export function assertUploadable(contentType: string, size: number) {
  if (!(contentType in EXTENSIONS)) {
    throw errors.unprocessable(
      'نوع الملف غير مسموح. الصور المقبولة: JPEG وPNG وWebP.',
    )
  }

  if (size > MAX_BYTES) {
    throw errors.unprocessable(
      `حجم الملف يتجاوز ${MAX_BYTES / (1024 * 1024)} ميغابايت.`,
    )
  }
}

/**
 * مفتاح لا يحمل شيئًا من اسم الملف الأصلي.
 *
 * اسم الملف قد يحمل اسم شخص أو مسارًا من جهاز من رفعه، والمفتاح يظهر في
 * رابط علني إلى الأبد. ومعرّف عشوائي يجعل الرابط ثابت المحتوى، فيُخزَّن
 * مؤقتًا للأبد بلا خوف من أن يتغيّر تحته شيء.
 */
export function keyFor(purpose: UploadPurpose, contentType: string) {
  return `${PREFIXES[purpose]}/${randomUUID()}.${EXTENSIONS[contentType]}`
}

/**
 * رابط رفع موقّع يذهب إليه المتصفح مباشرة.
 *
 * الملف لا يمرّ بالخادم: الـVPS صغير، وتمرير صور بحجم ميغابايتات عبره
 * يستهلك ذاكرته ونطاقه بلا فائدة. والتوقيع يقيّد المفتاح والنوع والحجم
 * معًا، فلا يصير رابطًا مفتوحًا لرفع ما يشاء من يمسكه.
 */
export async function signUpload(input: {
  purpose: UploadPurpose
  contentType: string
  size: number
}) {
  assertUploadable(input.contentType, input.size)

  const { client, bucket, publicBaseUrl } = requireStorage()
  const key = keyFor(input.purpose, input.contentType)

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.size,
      // المحتوى لا يتغيّر تحت مفتاحه أبدًا، فالتخزين المؤقت الأبدي صحيح.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
    {
      expiresIn: env.R2_SIGNED_URL_TTL_SECONDS,
      /**
       * نوع المحتوى داخل التوقيع لا خارجه.
       *
       * الموقِّع لا يضمّه من تلقائه، فكان الرابط يقيّد المفتاح والحجم وحدهما
       * ويقبل أي نوع — ومن يمسك الرابط يرفع به HTML على مفتاح `.jpg`.
       */
      signableHeaders: new Set(['content-type']),
    },
  )

  return {
    uploadUrl,
    publicUrl: `${publicBaseUrl}/${key}`,
    expiresInSeconds: env.R2_SIGNED_URL_TTL_SECONDS,
  }
}
