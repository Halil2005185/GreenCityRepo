import { describe, expect, it } from 'vitest'

import { assertUploadable, keyFor } from '../../src/modules/uploads/uploads.service.js'

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
