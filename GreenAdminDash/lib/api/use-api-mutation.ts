"use client";

import {
  type QueryKey,
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useId } from "react";
import { toast } from "sonner";

import { errorMessage } from "./errors";

type Resolve<T, TData, TVariables> = T | ((data: TData, variables: TVariables) => T);

function resolve<T, TData, TVariables>(
  value: Resolve<T, TData, TVariables>,
  data: TData,
  variables: TVariables,
): T {
  return typeof value === "function"
    ? (value as (data: TData, variables: TVariables) => T)(data, variables)
    : value;
}

/**
 * طفرة لفعل مباشر (زر بلا نافذة): إشعار بالنتيجة نجاحًا وفشلًا، وتحديث
 * القوائم المتأثرة.
 *
 * كان النجاح صامتًا في كل مكان تقريبًا، وبعض الفشل صامتًا أيضًا — فيضغط
 * المستخدم ولا يعرف أحدث شيء أم لا.
 *
 * `isPendingFor` يتتبع كل نداء قيد التنفيذ عبر `useMutationState`، لا آخر
 * نداء وحده: نقرتان سريعتان على صفّين تُظهران الدوران على الاثنين، وزر
 * الموافقة في صف لا يدور في كل الصفوف.
 *
 * النوافذ لا تستعملها: `FormDialog` و`useConfirm` يعرضان الخطأ داخلهما.
 */
export function useApiMutation<TData, TVariables = void>({
  mutationFn,
  successMessage,
  errorFallback,
  invalidate,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  successMessage?: Resolve<string, TData, TVariables>;
  errorFallback?: string;
  invalidate?: Resolve<readonly QueryKey[], TData, TVariables>;
  onSuccess?: (data: TData, variables: TVariables) => void;
}) {
  const queryClient = useQueryClient();
  const mutationKey = ["api-mutation", useId()];

  const mutation = useMutation({
    mutationKey,
    mutationFn,
    onSuccess: async (data, variables) => {
      if (invalidate) {
        await Promise.all(
          resolve(invalidate, data, variables).map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        );
      }

      if (successMessage) toast.success(resolve(successMessage, data, variables));

      onSuccess?.(data, variables);
    },
    onError: (error) => {
      toast.error(errorMessage(error, errorFallback));
    },
  });

  const pending = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (entry) => entry.state.variables as TVariables,
  });

  const isPendingFor = useCallback(
    (match: (variables: TVariables) => boolean) => pending.some(match),
    [pending],
  );

  return { ...mutation, isPendingFor };
}
