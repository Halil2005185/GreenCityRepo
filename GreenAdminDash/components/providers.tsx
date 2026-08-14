"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api/client";
import { AuthProvider } from "@/lib/auth/auth-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  /**
   * العميل يُنشأ داخل الحالة لا في نطاق الوحدة: عميل على مستوى الوحدة
   * يُشارك ذاكرته بين طلبات مختلفة على الخادم، فتتسرب بيانات مستخدم إلى
   * مستخدم آخر.
   */
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // 4xx لن يتغير بإعادة المحاولة؛ إعادة المحاولة عليه تأخير بلا فائدة.
              if (error instanceof ApiError && error.status < 500) return false;

              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
