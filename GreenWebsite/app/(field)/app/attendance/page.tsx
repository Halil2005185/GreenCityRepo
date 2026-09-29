import type { Metadata } from "next";

import { AttendanceScreen } from "@/components/field/attendance-screen";

export const metadata: Metadata = { title: "الحضور" };

export default function FieldAttendancePage() {
  return <AttendanceScreen />;
}
