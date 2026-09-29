import { describe, expect, it } from 'vitest'

import {
  CHECKIN_PERIOD_SECONDS,
  checkinCode,
  matchesCheckinCode,
  oneTimeCode,
} from '../../src/modules/field/field-checkin.service.js'

/**
 * رمز الحضور يحسبه هاتف القائد بلا شبكة ويتحقق منه الخادم: طرفان يكتبان
 * الخوارزمية نفسها في لغتين. متجهات RFC 6238 (الملحق ب، SHA-256) هي الحَكَم
 * بينهما — ما طابقها هنا يطابقها في المتصفح.
 */
describe('one-time code', () => {
  const key = Buffer.from('12345678901234567890123456789012', 'ascii')

  it.each([
    [59, '46119246'],
    [1_111_111_109, '68084774'],
    [1_111_111_111, '67062674'],
    [1_234_567_890, '91819424'],
    [2_000_000_000, '90698825'],
    [20_000_000_000, '77737706'],
  ])('matches RFC 6238 at %i seconds', (seconds, expected) => {
    expect(oneTimeCode(key, Math.floor(seconds / 30), 8)).toBe(expected)
  })

  it('keeps leading zeros', () => {
    const codes = Array.from({ length: 400 }, (_, counter) =>
      oneTimeCode(key, counter, 6),
    )

    expect(codes.every((code) => /^[0-9]{6}$/.test(code))).toBe(true)
    expect(codes.some((code) => code.startsWith('0'))).toBe(true)
  })
})

describe('check-in code', () => {
  const secret = 'a3f1c2d4e5b6978877665544332211ffeeddccbb'
  const at = (seconds: number) => new Date(seconds * 1000)
  const noon = 1_790_000_040

  it('holds for its minute and changes with the next', () => {
    const code = checkinCode(secret, at(noon))

    expect(checkinCode(secret, at(noon + CHECKIN_PERIOD_SECONDS - 1))).toBe(code)
    expect(checkinCode(secret, at(noon + CHECKIN_PERIOD_SECONDS))).not.toBe(code)
  })

  it('differs between groups', () => {
    expect(checkinCode(secret, at(noon))).not.toBe(
      checkinCode(secret.replace('a3', 'b4'), at(noon)),
    )
  })

  it('is accepted two minutes either side of the moment it was typed', () => {
    const code = checkinCode(secret, at(noon))

    for (const minutes of [-2, -1, 0, 1, 2]) {
      expect(
        matchesCheckinCode(secret, code, at(noon + minutes * 60)),
      ).toBe(true)
    }

    expect(matchesCheckinCode(secret, code, at(noon + 3 * 60))).toBe(false)
    expect(matchesCheckinCode(secret, code, at(noon - 3 * 60))).toBe(false)
  })

  it('refuses what is not the code', () => {
    const code = checkinCode(secret, at(noon))
    const other = String((Number(code) + 1) % 1_000_000).padStart(6, '0')

    expect(matchesCheckinCode(secret, other, at(noon))).toBe(false)
    expect(matchesCheckinCode(secret, '', at(noon))).toBe(false)
    expect(matchesCheckinCode(secret, code.slice(0, 5), at(noon))).toBe(false)
  })
})
