import type { Metadata } from "next";

import { MeScreen } from "@/components/field/me-screen";

export const metadata: Metadata = { title: "أنا" };

export default function FieldMePage() {
  return <MeScreen />;
}
