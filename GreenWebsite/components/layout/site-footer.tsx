import Link from "next/link";

import { BrandLockup } from "@/components/layout/logo";
import { Backdrop } from "@/components/ui/backdrop";
import { Container } from "@/components/ui/container";
import { contactChannels, footerNav, siteConfig } from "@/lib/site";

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  linkedin: "لينكدإن",
  x: "إكس",
};

export function SiteFooter() {
  const socials = Object.entries(SOCIAL_LABELS).filter(
    ([key]) => contactChannels[key as keyof typeof contactChannels],
  );

  return (
    <footer className="relative isolate overflow-hidden border-t border-border">
      <Backdrop src="/bg/footer.webp" scrim="strong" />

      <Container>
        {/*
          النص هنا كله بيجٌ كامل لا مخفَّف — القاعدة مشروحة في `Backdrop`:
          في اللوحة بكسلات أوراق مُشمسة تُسقط النص الثانوي تحت حدّ التباين.
        */}
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4 lg:col-span-2">
            <BrandLockup />
            <p className="max-w-sm text-sm leading-7 text-foreground">
              {siteConfig.description}
            </p>
          </div>

          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title} className="space-y-4">
              <p className="text-base font-bold">{group.title}</p>
              <ul className="space-y-3">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="rounded text-sm text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-border/60 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-foreground">
            © <span className="numeric">{new Date().getFullYear()}</span>{" "}
            {siteConfig.name} — {siteConfig.tagline}
          </p>

          {/*
            القنوات تُقرأ من `lib/site.ts`، والفارغة لا تُعرض: رابطٌ إلى
            حساب غير موجود أسوأ من غياب الرابط.

            حبّات نصّية لا أيقونات دائرية كما في التصميم المُسلَّم: أزال
            `lucide` أيقونات العلامات التجارية في الإصدار الأول، ورسمها
            يدويًا يُنتج شعارًا قريبًا من الأصل لا مطابقًا له. الاسم مكتوبًا
            أوضح لقارئ الشاشة على كل حال.
          */}
          {(contactChannels.email || socials.length > 0) && (
            <ul className="flex flex-wrap items-center gap-2">
              {contactChannels.email && (
                <li>
                  <a
                    href={`mailto:${contactChannels.email}`}
                    className="inline-flex rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {contactChannels.email}
                  </a>
                </li>
              )}
              {socials.map(([key, label]) => (
                <li key={key}>
                  <a
                    href={contactChannels[key as keyof typeof contactChannels]}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </footer>
  );
}
