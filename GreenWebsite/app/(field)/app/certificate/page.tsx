import type { Metadata } from "next";

import { CertificateScreen } from "@/components/field/certificate-screen";

export const metadata: Metadata = { title: "شهادتي" };

export default function FieldCertificatePage() {
  return <CertificateScreen />;
}
