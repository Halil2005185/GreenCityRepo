import { describe, expect, it } from 'vitest'

import {
  isLocalUrl,
  nameKey,
  phoneKey,
  whatsappNumber,
} from '../../src/common/utils/text.js'

/**
 * صورتا المطابقة هما ما يمنع أن يصير الشخص مشاركَين حين يُضاف من استمارتين
 * كتب فيهما اسمه وهاتفه بإملاءين.
 */
describe('participant matching keys', () => {
  it('reads spelling variants of a name as one name', () => {
    expect(nameKey('أسامة  الحلبي')).toBe(nameKey('اسامه الحلبى'))
    expect(nameKey('آمِنة يوسف')).toBe(nameKey('امنه يوسف'))
    expect(nameKey('عـــلي')).toBe(nameKey('علي'))
    expect(nameKey('سلمى')).not.toBe(nameKey('سلمان'))
  })

  it('reads the ways a Syrian number is written as one number', () => {
    const key = phoneKey('+963 944 123 456')

    expect(key).toBe('944123456')
    expect(phoneKey('0944123456')).toBe(key)
    expect(phoneKey('00963944123456')).toBe(key)
    expect(phoneKey('٠٩٤٤ ١٢٣ ٤٥٦')).toBe(key)
    expect(phoneKey('(0944) 123-456')).toBe(key)
  })

  it('refuses what is too short to be a phone', () => {
    expect(phoneKey('12345')).toBeNull()
    expect(phoneKey('')).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })
})

/**
 * رابط واتساب يفتح محادثة مع صاحب الرقم. رقمٌ خُمّن خطأً يفتحها مع غيره
 * ويضع رابطًا شخصيًا في يده، فما لا يُعرف دوليًا لا يُخمَّن.
 */
describe('whatsapp numbers', () => {
  it('gives a Syrian mobile its country code', () => {
    expect(whatsappNumber('0944 123 456')).toBe('963944123456')
    expect(whatsappNumber('٠٩٤٤١٢٣٤٥٦')).toBe('963944123456')
    expect(whatsappNumber('(0944) 123-456')).toBe('963944123456')
  })

  it('keeps an international number as it was written', () => {
    expect(whatsappNumber('+963 944 123 456')).toBe('963944123456')
    expect(whatsappNumber('00963944123456')).toBe('963944123456')
    expect(whatsappNumber('+90 555 123 4567')).toBe('905551234567')
  })

  it('does not guess what it cannot dial', () => {
    expect(whatsappNumber('011 2345678')).toBeNull()
    expect(whatsappNumber('944123456')).toBeNull()
    expect(whatsappNumber('+12')).toBeNull()
    expect(whatsappNumber('')).toBeNull()
    expect(whatsappNumber(null)).toBeNull()
  })
})

/**
 * بها يرفض الخادم في الإنتاج توليد روابط شخصية على عنوان لم يُضبط: رابط إلى
 * `localhost` يصل المتطوع ولا يفتح شيئًا.
 */
describe('local urls', () => {
  it('knows a development address', () => {
    expect(isLocalUrl('http://localhost:3001')).toBe(true)
    expect(isLocalUrl('http://127.0.0.1:3001/app')).toBe(true)
    expect(isLocalUrl('http://[::1]:3001')).toBe(true)
    expect(isLocalUrl('http://site.localhost')).toBe(true)
  })

  it('lets a public address through', () => {
    expect(isLocalUrl('https://greencities.evavolunteer.com')).toBe(false)
    expect(isLocalUrl('https://localhost.example.org')).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
  })
})
