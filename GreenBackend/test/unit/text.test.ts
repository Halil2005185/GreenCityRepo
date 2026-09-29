import { describe, expect, it } from 'vitest'

import { nameKey, phoneKey } from '../../src/common/utils/text.js'

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
