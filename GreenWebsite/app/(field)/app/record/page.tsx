import type { Metadata } from "next";

import { RecordScreen } from "@/components/field/record-screen";

export const metadata: Metadata = { title: "سجلّي" };

export default function FieldRecordPage() {
  return <RecordScreen />;
}
