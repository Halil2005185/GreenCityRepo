import Link from "next/link";

import { Logo } from "@/components/layout/logo";
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
    <footer className="border-t border-border bg-muted/30">
      <Container>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <Logo className="size-8 text-primary" />
              <span className="text-base font-bold">{siteConfig.name}</span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {siteConfig.description}
            </p>
          </div>

          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title} className="space-y-3">
              <p className="text-sm font-semibold">{group.title}</p>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © <span className="numeric">{new Date().getFullYear()}</span>{" "}
            {siteConfig.name} — {siteConfig.tagline}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            {contactChannels.email && (
              <a
                href={`mailto:${contactChannels.email}`}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {contactChannels.email}
              </a>
            )}
            {socials.map(([key, label]) => (
              <a
                key={key}
                href={contactChannels[key as keyof typeof contactChannels]}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
