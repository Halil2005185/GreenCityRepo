import { Logo } from "@/components/layout/logo";

/**
 * تخطيط صفحات المصادقة: عمود ضيق موسّط بلا شريط جانبي ولا تنقل — لا شيء
 * يُنقر عليه قبل الدخول.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="mx-auto h-16" />
          <h1 className="mt-3 text-2xl font-bold text-primary">المدن الخضراء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نعيد الحياة للمدن
          </p>
        </div>

        {children}

        <p className="text-center text-xs text-muted-foreground">
          الدخول بدعوة من إدارة المشروع. لا يوجد تسجيل عام.
        </p>
      </div>
    </div>
  );
}
