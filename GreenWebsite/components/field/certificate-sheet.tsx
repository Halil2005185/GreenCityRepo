import { QrImage } from "@/components/field/qr-image";
import {
  formatCertificateCode,
  type VerifiedCertificate,
} from "@/lib/certificates";
import { formatDate } from "@/lib/field/labels";
import { siteConfig } from "@/lib/site";
import { formatNumber } from "@/lib/utils";

/**
 * العنوان كما يُكتب باليد: الصفحة بلا رمزها، والرمز مطبوع فوقه يُكتب فيها.
 * عنوانٌ برمزه في ذيله أطول من أن يُنقل من ورقة بلا خطأ.
 */
function typedAddress(url: string) {
  try {
    const { host, pathname } = new URL(url);

    return `${host}${pathname}`;
  } catch {
    return url;
  }
}

function daysText(count: number) {
  if (count === 1) return "يومًا واحدًا";
  if (count === 2) return "يومين";

  return `${formatNumber(count)} ${count <= 10 ? "أيام" : "يومًا"}`;
}

function hoursText(value: number) {
  if (value === 1) return "ساعة واحدة";
  if (value === 2) return "ساعتين";

  const whole = Number.isInteger(value);

  return `${formatNumber(value, whole ? 0 : 1)} ${
    whole && value <= 10 ? "ساعات" : "ساعة"
  }`;
}

/**
 * شهادة المشاركة ورقةً واحدة. تُعرض في التطبيق وتُطبع كما هي: الطباعة إلى
 * PDF من المتصفح هي «تنزيل الشهادة»، فلا مولّد PDF على الخادم ولا خط عربي
 * يُضمَّن فيه.
 *
 * صياغتها بالمصدر («بمشاركة فلان») لا بالفعل: الاسم قد يكون لرجل أو امرأة،
 * والورقة لا تخمّن.
 *
 * `certificate-sheet` في `globals.css`: تُطبع بألوانها، وعلى ورقة عرضية حيث
 * يدعم المتصفح تسمية الصفحات.
 */
export function CertificateSheet({
  certificate,
  verifyUrl,
}: {
  certificate: VerifiedCertificate;
  /** عنوان صفحة التحقق برمزها: يحمله الرمز المربّع، ويُطبع نصًّا بلا رمزه. */
  verifyUrl: string;
}) {
  const { firstDay, lastDay, hours, signer } = certificate;
  const when =
    firstDay && lastDay
      ? firstDay === lastDay
        ? `في ${formatDate(firstDay)}`
        : `بين ${formatDate(firstDay)} و${formatDate(lastDay)}`
      : null;

  return (
    <article
      aria-label={`شهادة مشاركة ${certificate.fullNameAr}`}
      className="certificate-sheet rounded-2xl border-2 border-accent-ink bg-white p-2 text-accent-ink print:rounded-none"
    >
      <div className="flex h-full flex-col items-center gap-5 rounded-xl border border-accent-ink/40 px-5 py-8 text-center print:justify-between print:gap-0 print:px-16 print:py-10">
        <header className="flex flex-col items-center gap-2">
          <span aria-hidden className="brand-logo h-12 print:h-16" />
          <p className="text-sm font-bold tracking-wide print:text-base">
            {siteConfig.name}
          </p>
        </header>

        <div className="space-y-3 print:space-y-5">
          <h2 className="text-2xl font-bold print:text-4xl">شهادة مشاركة</h2>

          <p className="text-sm leading-loose print:text-lg">
            تشهد {siteConfig.name} بمشاركة
          </p>

          <p className="text-2xl font-bold leading-snug print:text-5xl">
            {certificate.fullNameAr}
          </p>

          <p className="mx-auto max-w-prose text-sm leading-loose print:text-lg">
            تطوّعًا في «{certificate.initiativeNameAr}» من برنامج{" "}
            {certificate.programNameAr}، {daysText(certificate.days)}
            {hours === null ? "" : ` بمجموع ${hoursText(hours)}`}
            {when ? `، ${when}` : ""}.
          </p>

          {certificate.sites.length > 0 ? (
            <p className="text-xs leading-relaxed text-accent-ink/80 print:text-sm">
              {certificate.sites.join("، ")}
            </p>
          ) : null}
        </div>

        <footer className="flex w-full flex-col items-center gap-5 print:flex-row print:items-end print:justify-between">
          <div className="text-center print:text-start">
            {signer ? (
              <>
                <p className="text-base font-bold print:text-lg">
                  {signer.nameAr}
                </p>
                {signer.titleAr ? (
                  <p className="text-xs print:text-sm">{signer.titleAr}</p>
                ) : null}
              </>
            ) : null}
            <p className="mt-2 text-xs text-accent-ink/80 print:text-sm">
              صدرت في {formatDate(certificate.issuedAt)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-end">
              <p className="text-xs text-accent-ink/80">للتحقق من الشهادة</p>
              <p className="numeric text-sm font-bold tracking-widest">
                {formatCertificateCode(certificate.code)}
              </p>
              <p dir="ltr" className="text-[0.65rem] text-accent-ink/80">
                {typedAddress(verifyUrl)}
              </p>
            </div>
            <QrImage
              text={verifyUrl}
              label="رمز مربّع يفتح صفحة التحقق من الشهادة"
              className="size-20 shrink-0 print:size-24"
            />
          </div>
        </footer>
      </div>
    </article>
  );
}
