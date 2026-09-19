import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Section } from "@/components/ui/section";
import { contactChannels, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: `قنوات التواصل مع فريق ${siteConfig.name} للشراكات والتطوع والاستفسارات الإعلامية.`,
  alternates: { canonical: "/contact" },
};

const SOCIAL_LABELS: { key: keyof typeof contactChannels; label: string }[] = [
  { key: "facebook", label: "فيسبوك" },
  { key: "instagram", label: "إنستغرام" },
  { key: "linkedin", label: "لينكدإن" },
  { key: "x", label: "إكس" },
];

export default function ContactPage() {
  const socials = SOCIAL_LABELS.filter(({ key }) => contactChannels[key]);
  const hasDirect = Boolean(contactChannels.email || contactChannels.phone);

  return (
    <>
      <PageHeader
        eyebrow="تواصل"
        title="تواصل معنا"
        description="للشراكات والتطوع والاستفسارات الإعلامية. نجيب عادة خلال أيام العمل."
      />

      <Section>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {hasDirect ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {contactChannels.email && (
                  <Card>
                    <CardHeader>
                      <Mail className="size-5 text-primary" aria-hidden />
                      <CardTitle>البريد الإلكتروني</CardTitle>
                      <a
                        href={`mailto:${contactChannels.email}`}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {contactChannels.email}
                      </a>
                    </CardHeader>
                  </Card>
                )}
                {contactChannels.phone && (
                  <Card>
                    <CardHeader>
                      <Phone className="size-5 text-primary" aria-hidden />
                      <CardTitle>الهاتف</CardTitle>
                      <a
                        href={`tel:${contactChannels.phone}`}
                        className="numeric text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {contactChannels.phone}
                      </a>
                    </CardHeader>
                  </Card>
                )}
              </div>
            ) : (
              /**
               * قنوات التواصل الرسمية تُضبط في `lib/site.ts`. حتى تُضبط،
               * لا يُعرض بريد ولا رقم مخترَع — الزائر يراسله ولا يصله جواب.
               */
              <EmptyState
                title="قنوات التواصل قيد الإعداد"
                description="سنعلن البريد الرسمي وحسابات المشروع هنا قريبًا."
              />
            )}

            {socials.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">تابعنا</h2>
                <ul className="flex flex-wrap gap-3">
                  {socials.map(({ key, label }) => (
                    <li key={key}>
                      <a
                        href={contactChannels[key]}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>هل أنت شريك حالي؟</CardTitle>
              <p className="text-sm leading-loose text-muted-foreground">
                لممثلي الجهات الشريكة بوابة خاصة لمتابعة المبادرات والمهام
                والمساهمات. يُفتح الحساب بدعوة من فريق المشروع لا بتسجيل عام.
              </p>
            </CardHeader>
          </Card>
        </div>
      </Section>
    </>
  );
}
