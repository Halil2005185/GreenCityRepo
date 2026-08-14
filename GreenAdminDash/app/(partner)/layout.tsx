import { PartnerShell } from "@/components/layout/partner-shell";

export default function PartnerLayout({ children }: LayoutProps<"/">) {
  return <PartnerShell>{children}</PartnerShell>;
}
