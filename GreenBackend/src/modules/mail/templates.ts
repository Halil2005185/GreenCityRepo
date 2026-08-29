/**
 * قوالب البريد — تُصيَّر وقت الإرسال لا وقت الإدراج.
 *
 * السبب: رسالة انتظرت في الطابور ساعةً بسبب عطل مزوّد يجب أن تخرج بنصّها
 * المصحَّح لا بنصّها القديم. ولأن الصف يحمل مفتاحًا وبيانات فقط، يبقى
 * صغيرًا ولا يتضخّم بـHTML مكرّر.
 *
 * وHTML مكتوب يدويًا بلا محرّك قوالب: أربع رسائل لا تستحق اعتمادًا، وعملاء
 * البريد يرفضون معظم CSS الحديث أصلًا فتبقى الأنماط سطرية مهما فعلنا.
 */

export type TemplateKey = 'invitation' | 'password-reset' | 'form-copy'

export type RenderedMail = {
  subject: string
  html: string
  text: string
}

/** يمنع حقن HTML من اسم أو نصّ يأتي من المستخدم. */
function escape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * الغلاف بـ`dir="rtl"` وخط نظام.
 *
 * الخطوط المخصّصة تُحجب في أغلب عملاء البريد، وتحميلها يخاطر بأن تُعرض
 * الرسالة بخط بديل لا نتحكم به — فالأسلم البدء بما هو مثبّت.
 */
function layout(title: string, body: string) {
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f6f7f6;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
    <div style="font-size:20px;font-weight:700;color:#15803d;margin-bottom:4px">المدن الخضراء</div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:20px">نعيد الحياة للمدن</div>
    <h1 style="font-size:18px;margin:0 0 14px">${escape(title)}</h1>
    ${body}
  </div>
  <div style="max-width:560px;margin:14px auto 0;font-size:12px;color:#9ca3af;text-align:center">
    هذه رسالة آلية من نظام تشغيل المدن الخضراء.
  </div>
</body></html>`
}

function button(href: string, label: string) {
  return `<p style="margin:22px 0">
    <a href="${escape(href)}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600">${escape(label)}</a>
  </p>
  <p style="font-size:12px;color:#6b7280;margin:0">
    إن لم يعمل الزر، انسخ هذا الرابط:<br>
    <span style="direction:ltr;display:inline-block;word-break:break-all;color:#374151">${escape(href)}</span>
  </p>`
}

type Renderer = (data: Record<string, unknown>) => RenderedMail

/** جدول سؤال/جواب — الأزواج تصل جاهزة من الخدمة، فالقالب لا يقرأ قاعدة. */
function answerTable(items: Array<{ labelAr: string; valueAr: string }>) {
  if (items.length === 0) {
    return '<p style="margin:0;color:#6b7280">لا إجابات مسجّلة.</p>'
  }

  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top;width:40%">${escape(item.labelAr)}</td>
        <td style="padding:8px 0;color:#111827;font-size:14px;vertical-align:top;white-space:pre-wrap">${escape(item.valueAr)}</td>
      </tr>`,
    )
    .join('')

  return `<table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table>`
}

const templates: Record<TemplateKey, Renderer> = {
  invitation: (data) => {
    const inviteUrl = String(data['inviteUrl'] ?? '')
    const roleNameAr = String(data['roleNameAr'] ?? '')
    const scopeNameAr = String(data['scopeNameAr'] ?? '')
    const invitedByAr = String(data['invitedByAr'] ?? '')
    const expiresInDays = Number(data['expiresInDays'] ?? 7)

    const where = scopeNameAr ? ` في ${scopeNameAr}` : ''
    const by = invitedByAr ? ` من ${invitedByAr}` : ''

    return {
      subject: 'دعوة للانضمام إلى نظام المدن الخضراء',
      html: layout(
        'دعوة للانضمام',
        `<p style="line-height:1.9;margin:0">
           وصلتك دعوة${escape(by)} للانضمام إلى نظام تشغيل المدن الخضراء
           بدور <strong>${escape(roleNameAr)}</strong>${escape(where)}.
         </p>
         ${button(inviteUrl, 'قبول الدعوة وإنشاء الحساب')}
         <p style="font-size:12px;color:#6b7280;margin:18px 0 0">
           تنتهي صلاحية الدعوة خلال ${expiresInDays} أيام. إن لم تكن تتوقع هذه
           الرسالة فتجاهلها — لن يُنشأ حساب دون قبولك.
         </p>`,
      ),
      text: `دعوة للانضمام إلى نظام المدن الخضراء بدور ${roleNameAr}${where}.\n\n${inviteUrl}\n\nتنتهي خلال ${expiresInDays} أيام.`,
    }
  },

  /**
   * نسخة الطلب إلى المتقدّم نفسه، بطلبه.
   *
   * بلا رابط ولا زر: الرسالة إيصالٌ لا دعوة إلى فعل، وزرٌّ فيها يعلّم
   * المتقدّم أن يضغط ما يصله باسمنا. وتقول صراحةً إنها لا تعني القبول،
   * فالصمت بعدها لا يُقرأ وعدًا.
   */
  'form-copy': (data) => {
    const formNameAr = String(data['formNameAr'] ?? '')
    const items = Array.isArray(data['items'])
      ? (data['items'] as Array<{ labelAr?: unknown; valueAr?: unknown }>).map(
          (item) => ({
            labelAr: String(item.labelAr ?? ''),
            valueAr: String(item.valueAr ?? ''),
          }),
        )
      : []

    return {
      subject: `نسخة من طلبك — ${formNameAr}`,
      html: layout(
        'نسخة من طلبك',
        `<p style="line-height:1.9;margin:0 0 18px">
           وصلنا طلبك في <strong>${escape(formNameAr)}</strong>، وهذه نسخة مما
           أرسلته كما طلبت.
         </p>
         ${answerTable(items)}
         <p style="font-size:12px;color:#6b7280;margin:20px 0 0">
           هذه نسخة للحفظ لا إشعار قبول. إن لم تكن أنت من أرسل الطلب فتجاهل
           الرسالة، ولم يُنشأ لك حساب ولا اشتراك.
         </p>`,
      ),
      text: [
        `نسخة من طلبك في ${formNameAr}:`,
        '',
        ...items.map((item) => `${item.labelAr}: ${item.valueAr}`),
        '',
        'هذه نسخة للحفظ لا إشعار قبول.',
      ].join('\n'),
    }
  },

  'password-reset': (data) => {
    const resetUrl = String(data['resetUrl'] ?? '')
    const minutes = Number(data['expiresInMinutes'] ?? 60)

    return {
      subject: 'استعادة كلمة المرور — المدن الخضراء',
      html: layout(
        'استعادة كلمة المرور',
        `<p style="line-height:1.9;margin:0">
           طُلبت استعادة كلمة المرور لحسابك. اضغط الزر لتعيين كلمة مرور جديدة.
         </p>
         ${button(resetUrl, 'تعيين كلمة مرور جديدة')}
         <p style="font-size:12px;color:#6b7280;margin:18px 0 0">
           ينتهي الرابط خلال ${minutes} دقيقة ويُستعمل مرة واحدة. إن لم تطلب
           ذلك فتجاهل الرسالة — كلمة مرورك الحالية لم تتغيّر.
         </p>`,
      ),
      text: `لتعيين كلمة مرور جديدة:\n\n${resetUrl}\n\nينتهي الرابط خلال ${minutes} دقيقة ويُستعمل مرة واحدة.`,
    }
  },
}

export function isTemplateKey(value: string): value is TemplateKey {
  return value in templates
}

export function renderTemplate(
  key: TemplateKey,
  data: Record<string, unknown>,
): RenderedMail {
  return templates[key](data)
}
