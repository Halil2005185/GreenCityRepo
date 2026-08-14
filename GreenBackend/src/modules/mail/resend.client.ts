import { env } from '../../config/env.js'

const ENDPOINT = 'https://api.resend.com/emails'

export type OutgoingMail = {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * ينادي Resend عبر HTTP مباشرة بلا حزمة عميل.
 *
 * الطلب حقل واحد ومسار واحد، والحزمة كانت ستضيف اعتمادًا يُحدَّث ويُدقَّق
 * مقابل لا شيء. و`fetch` مدمج في Node 24.
 */
export async function sendEmail(mail: OutgoingMail): Promise<{ id?: string }> {
  /**
   * الإطفاء لا يعني الفشل: على جهاز التطوير يُطبع الرابط في السجل
   * وتُعلَّم الرسالة مُرسَلة، فيعمل مسار الدعوة والاستعادة كاملًا دون
   * نطاق موثَّق ولا مفتاح.
   */
  if (!env.MAIL_ENABLED) {
    console.info('[mail:disabled]', {
      to: mail.to,
      subject: mail.subject,
      preview: mail.text.slice(0, 300),
    })

    return {}
  }

  if (!env.RESEND_API_KEY) {
    throw new Error('MAIL_ENABLED is true but RESEND_API_KEY is missing.')
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}),
    }),
  })

  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string }
    | null

  if (!response.ok) {
    /**
     * رسالة المزوّد تُرفع كما هي: أشيع أسباب الرفض أن النطاق غير موثَّق
     * أو أن الحساب في وضع الاختبار فلا يُرسل إلا لبريد صاحبه — وكلاهما
     * لا يُفهم من رمز الحالة وحده.
     */
    throw new Error(
      `Resend ${response.status}: ${body?.message ?? body?.name ?? 'unknown error'}`,
    )
  }

  return { ...(body?.id ? { id: body.id } : {}) }
}
