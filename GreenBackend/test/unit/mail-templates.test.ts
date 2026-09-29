import { describe, expect, it } from 'vitest'

import { renderTemplate } from '../../src/modules/mail/templates.js'

describe('form copy template', () => {
  const rendered = renderTemplate('form-copy', {
    formNameAr: 'استمارة الانضمام للمتطوعين',
    items: [
      { labelAr: 'الاسم الكامل', valueAr: 'ليان العمر' },
      { labelAr: 'المهارات', valueAr: 'زراعة، توثيق' },
    ],
  })

  it('names the form in the subject and lists every answer', () => {
    expect(rendered.subject).toContain('استمارة الانضمام للمتطوعين')

    for (const part of ['الاسم الكامل', 'ليان العمر', 'المهارات', 'زراعة، توثيق']) {
      expect(rendered.html).toContain(part)
      expect(rendered.text).toContain(part)
    }
  })

  it('says it is a receipt, not an acceptance', () => {
    expect(rendered.html).toContain('لا إشعار قبول')
  })

  /**
   * الإجابات نصٌّ كتبه مجهول على مسار عام، والرسالة تُقرأ في عميل بريد.
   * تركها خامًا يعني وسمًا يُحقن من نموذج مفتوح للعالم.
   */
  it('escapes markup that came from the applicant', () => {
    const hostile = renderTemplate('form-copy', {
      formNameAr: 'استمارة',
      items: [
        {
          labelAr: 'ملاحظات',
          valueAr: '<img src=x onerror="alert(1)">',
        },
      ],
    })

    expect(hostile.html).not.toContain('<img')
    expect(hostile.html).toContain('&lt;img')
  })

  it('renders an empty submission without breaking', () => {
    const empty = renderTemplate('form-copy', { formNameAr: 'استمارة', items: [] })

    expect(empty.html).toContain('لا إجابات مسجّلة')
  })
})

describe('personal link template', () => {
  const rendered = renderTemplate('field-link', {
    fullNameAr: 'لينا حداد',
    initiativeNameAr: 'حملة تشجير دمشق',
    groupNameAr: 'مجموعة الصنوبر',
    siteNameAr: 'حديقة تشرين',
    meetsAt: '2026-10-09T05:00:00.000Z',
    meetingPointAr: 'البوابة الشرقية',
    linkUrl: 'https://greencities.test/app/link#plk_example',
    expiresInDays: 45,
  })

  it('says where and when in words, not only behind the link', () => {
    expect(rendered.subject).toContain('حملة تشجير دمشق')

    for (const part of ['مجموعة الصنوبر', 'حديقة تشرين', 'البوابة الشرقية']) {
      expect(rendered.html).toContain(part)
      expect(rendered.text).toContain(part)
    }

    // الخامسة فجرًا بتوقيت غرينتش هي الثامنة صباحًا في دمشق.
    expect(rendered.text).toContain('8:00')
    expect(rendered.text).toContain('الجمعة')
  })

  it('carries the link whole, fragment included', () => {
    expect(rendered.html).toContain(
      'https://greencities.test/app/link#plk_example',
    )
    expect(rendered.text).toContain(
      'https://greencities.test/app/link#plk_example',
    )
  })

  it('leaves out what the group has not decided yet', () => {
    const bare = renderTemplate('field-link', {
      fullNameAr: 'لينا حداد',
      initiativeNameAr: 'حملة',
      groupNameAr: 'مجموعة',
      siteNameAr: 'موقع',
      meetsAt: null,
      meetingPointAr: null,
      linkUrl: 'https://greencities.test/app/link#plk_example',
    })

    expect(bare.html).not.toContain('نقطة اللقاء')
    expect(bare.html).not.toContain('الموعد')
  })

  it('escapes a name that carries markup', () => {
    const hostile = renderTemplate('field-link', {
      fullNameAr: '<b>اسم</b>',
      initiativeNameAr: 'حملة',
      linkUrl: 'https://greencities.test/app/link#plk_example',
    })

    expect(hostile.html).not.toContain('<b>اسم</b>')
  })
})
