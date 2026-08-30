import { describe, expect, it } from 'vitest'

import {
  assertUploadable,
  keyFor,
  signUpload,
} from '../../src/modules/uploads/uploads.service.js'

describe('upload guards', () => {
  it('accepts the image types the dashboard sends', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(() => assertUploadable(type, 1024)).not.toThrow()
    }
  })

  /**
   * قائمة سماح لا منع: ما لم يُذكر يُرفض. وSVG تحديدًا مستند قابل لحمل
   * نصّ برمجي، فقبولها يعني وسمًا يُنفَّذ من نطاق نقرأ منه صورنا.
   */
  it.each(['image/svg+xml', 'text/html', 'application/pdf', 'image/gif'])(
    'refuses %s',
    (type) => {
      expect(() => assertUploadable(type, 1024)).toThrow()
    },
  )

  it('refuses a file past the size cap', () => {
    expect(() => assertUploadable('image/png', 5 * 1024 * 1024 + 1)).toThrow()
    expect(() => assertUploadable('image/png', 5 * 1024 * 1024)).not.toThrow()
  })
})

describe('object keys', () => {
  it('puts each purpose in its own prefix with the type extension', () => {
    expect(keyFor('FORM_COVER', 'image/webp')).toMatch(
      /^forms\/covers\/[0-9a-f-]{36}\.webp$/,
    )
    expect(keyFor('GREEN_POINT_COVER', 'image/jpeg')).toMatch(
      /^green-points\/covers\/[0-9a-f-]{36}\.jpg$/,
    )
  })

  it('never repeats a key', () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => keyFor('INITIATIVE_COVER', 'image/png')),
    )

    expect(keys.size).toBe(50)
  })
})

describe('the signed upload url', () => {
  it('addresses the bucket and returns the public url for the same key', async () => {
    const signed = await signUpload({
      purpose: 'FORM_COVER',
      contentType: 'image/jpeg',
      size: 2048,
    })

    const url = new URL(signed.uploadUrl)
    const key = url.pathname.replace(/^\/(test-bucket\/)?/, '')

    expect(url.host).toContain('r2.cloudflarestorage.com')
    expect(signed.publicUrl).toBe(`https://media.test/${key}`)
    expect(signed.expiresInSeconds).toBeGreaterThan(0)
  })

  /**
   * الموقِّع يحسب CRC32 وقت التوقيع — ولا جسم للطلب حينها — فيخرج مجموع
   * الفراغ في الرابط، ثم يرفع المتصفح الملف الحقيقي فلا يطابق فيُردّ.
   * هذا ما وقع فعلًا عند أول رفع، فيبقى مقفلًا باختبار.
   */
  it('carries no checksum computed over an empty body', async () => {
    const { searchParams } = new URL(
      (
        await signUpload({
          purpose: 'FORM_COVER',
          contentType: 'image/png',
          size: 4096,
        })
      ).uploadUrl,
    )

    expect(searchParams.get('x-amz-checksum-crc32')).toBeNull()
    expect(searchParams.get('x-amz-sdk-checksum-algorithm')).toBeNull()
  })

  it('signs the content type and the length, so the url fits one file only', async () => {
    const { searchParams } = new URL(
      (
        await signUpload({
          purpose: 'GREEN_POINT_COVER',
          contentType: 'image/webp',
          size: 1024,
        })
      ).uploadUrl,
    )

    const signed = searchParams.get('X-Amz-SignedHeaders') ?? ''

    expect(signed).toContain('content-type')
    expect(signed).toContain('content-length')
  })
})
