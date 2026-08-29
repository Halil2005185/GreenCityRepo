import { describe, expect, it } from 'vitest'

import { introDocSchema } from '../../src/modules/forms/intro.schemas.js'

/**
 * ما يخرج من المحرّر فعلًا — نُسخ من ناتج Tiptap في اللوحة لا من الذاكرة.
 * تغييرُ إعداد المحرّر يجب أن يكسر هذا الاختبار قبل أن يكسر حفظ الموظف.
 */
const FROM_EDITOR = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: [{ type: 'bold' }],
                  text: 'نبحث عن متطوعين للعمل الميداني.',
                },
              ],
            },
          ],
        },
      ],
    },
    { type: 'paragraph' },
  ],
}

describe('form intro document', () => {
  it('accepts what the editor produces, empty trailing paragraph included', () => {
    expect(introDocSchema.safeParse(FROM_EDITOR).success).toBe(true)
  })

  it('accepts a link with an absolute http address', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'الميثاق',
              marks: [
                { type: 'link', attrs: { href: 'https://example.com/charter' } },
              ],
            },
          ],
        },
      ],
    }

    expect(introDocSchema.safeParse(doc).success).toBe(true)
  })

  /**
   * المستند يُصيَّر في متصفّح زائر، فالرفض هنا هو ما يمنع أن يصير حقل
   * مقدّمة بابًا لتنفيذ نصّ برمجي أو حقن وسم.
   */
  it.each([
    ['وسم خام', { type: 'html', html: '<script>alert(1)</script>' }],
    ['صورة غير مسموحة', { type: 'image', attrs: { src: 'x' } }],
    ['كتلة اقتباس', { type: 'blockquote', content: [] }],
  ])('rejects an unknown node: %s', (_label, node) => {
    expect(
      introDocSchema.safeParse({ type: 'doc', content: [node] }).success,
    ).toBe(false)
  })

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['نسبي', '/dashboard'],
    ['بلا بروتوكول', 'example.com'],
  ])('rejects a link address that is not http(s): %s', (_label, href) => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'اضغط', marks: [{ type: 'link', attrs: { href } }] },
          ],
        },
      ],
    }

    expect(introDocSchema.safeParse(doc).success).toBe(false)
  })

  it('rejects a heading level the page does not render', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'عنوان' }] },
      ],
    }

    expect(introDocSchema.safeParse(doc).success).toBe(false)
  })

  it('rejects a document longer than the cap', () => {
    const doc = {
      type: 'doc',
      content: Array.from({ length: 41 }, () => ({ type: 'paragraph' })),
    }

    expect(introDocSchema.safeParse(doc).success).toBe(false)
  })
})
