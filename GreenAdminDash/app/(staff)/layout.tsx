import { StaffShell } from "@/components/layout/staff-shell";

export default function StaffLayout({ children }: LayoutProps<"/">) {
  return <StaffShell>{children}</StaffShell>;
}
