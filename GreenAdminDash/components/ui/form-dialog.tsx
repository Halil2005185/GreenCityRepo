"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DefaultValues,
  FieldPath,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  type DialogSize,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";

type FormDialogProps<TValues extends FieldValues, TResult> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  size?: DialogSize;
  /**
   * `sheet` لنموذج طويل بأقسام كثيرة: لوحة بطول الشاشة تُمرَّر وحدها،
   * والصفحة تبقى في موضعها خلفها.
   */
  presentation?: "dialog" | "sheet";
  form: UseFormReturn<TValues>;
  /** القيم عند كل فتح — للتعديل. بدونها يبدأ النموذج من `defaultValues`. */
  values?: DefaultValues<TValues>;
  onSubmit: (values: TValues) => Promise<TResult>;
  submitLabel: string;
  successMessage?: string | ((result: TResult) => string);
  /** بعد الإغلاق: `invalidateQueries`، أو الانتقال إلى صفحة الكيان الجديد. */
  onSuccess?: (result: TResult, values: TValues) => void;
  /** يربط مسار خطأ الخادم باسم الحقل حين يختلفان. */
  mapFieldPath?: (path: string) => FieldPath<TValues> | null;
  /** خطأ بلا تفاصيل يخص حقلًا بعينه — 409 «المعرّف مستعمل» تحت حقل المعرّف. */
  fieldForError?: (error: ApiError) => FieldPath<TValues> | null;
  /** يُعرض بعد النجاح بدل الإغلاق — رابط الدعوة الذي لا يظهر مرة ثانية. */
  renderSuccess?: (result: TResult) => React.ReactNode;
  children: React.ReactNode;
};

function hasPath(values: unknown, path: string) {
  let current: unknown = values;

  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object" || !(key in current)) return false;
    current = (current as Record<string, unknown>)[key];
  }

  return true;
}

/**
 * نافذة نموذج: الإضافة والتعديل كلها هنا، لا نماذج مفتوحة في جسم الصفحة.
 *
 * - لا تُغلق أثناء الحفظ، وإغلاق نموذج معدَّل يسأل قبل تجاهل التغييرات.
 * - أخطاء التحقق من الخادم (`ApiError.fieldIssues`) تظهر تحت حقولها،
 *   والباقي في تنبيه أعلى النافذة نفسها لا أعلى الصفحة.
 * - بعد النجاح: إغلاق، وإشعار، ثم `onSuccess`.
 *
 * التذييل «إلغاء» ثم الزر الأساسي، فيقع الأساسي في أقصى جهة النهاية.
 */
export function FormDialog<TValues extends FieldValues, TResult>({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  presentation = "dialog",
  form,
  values,
  onSubmit,
  submitLabel,
  successMessage,
  onSuccess,
  mapFieldPath,
  fieldForError,
  renderSuccess,
  children,
}: FormDialogProps<TValues, TResult>) {
  const confirm = useConfirm();
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ value: TResult } | null>(null);

  // تُقرأ أثناء التصيير كي يشترك فيها react-hook-form ويحدّثها.
  const { isDirty, isSubmitting } = form.formState;

  // كل فتح جلسة جديدة: لا خطأ قديم ولا نتيجة من المرة السابقة.
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setFormError(null);
      setResult(null);
    }
  }

  // أحدث قيم التعديل دون أن يعيد تغيّر مرجعها ضبط نموذج مفتوح يُكتب فيه.
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  });

  useEffect(() => {
    if (open) form.reset(valuesRef.current);
  }, [open, form]);

  async function requestClose() {
    if (isSubmitting) return;

    if (isDirty && !result) {
      const discard = await confirm({
        title: "تجاهل التغييرات؟",
        description: "لم تُحفظ تعديلاتك في هذه النافذة، وستضيع إن أغلقتها.",
        confirmLabel: "تجاهل التغييرات",
        cancelLabel: "متابعة التحرير",
        destructive: true,
      });

      if (!discard) return;
    }

    onOpenChange(false);
  }

  function applyServerError(error: unknown) {
    if (!(error instanceof ApiError)) {
      return errorMessage(error, "تعذّر الحفظ. حاول مجددًا.");
    }

    const conflictField = fieldForError?.(error);

    if (conflictField) {
      form.setError(conflictField, { type: "server", message: error.message });
      form.setFocus(conflictField);
      return null;
    }

    const current = form.getValues();
    const leftovers: string[] = [];
    let first: FieldPath<TValues> | null = null;

    for (const issue of error.fieldIssues) {
      if (issue.in && issue.in !== "body") {
        leftovers.push(issue.message);
        continue;
      }

      const top = issue.path.split(".")[0] ?? "";
      const name =
        mapFieldPath?.(issue.path) ??
        (top in current
          ? ((hasPath(current, issue.path) ? issue.path : top) as FieldPath<TValues>)
          : null);

      if (name) {
        form.setError(name, { type: "server", message: issue.message });
        first ??= name;
      } else {
        leftovers.push(issue.message);
      }
    }

    if (first) form.setFocus(first);

    if (error.fieldIssues.length === 0) return error.message;

    return leftovers.length > 0 ? [error.message, ...leftovers].join(" ") : null;
  }

  const submit = form.handleSubmit(async (submitted) => {
    setFormError(null);

    try {
      const value = await onSubmit(submitted);
      const message =
        typeof successMessage === "function" ? successMessage(value) : successMessage;

      if (message) toast.success(message);

      if (renderSuccess) setResult({ value });
      else onOpenChange(false);

      onSuccess?.(value, submitted);
    } catch (error) {
      setFormError(applyServerError(error));
    }
  });

  const parts =
    presentation === "sheet"
      ? { Header: SheetHeader, Title: SheetTitle, Description: SheetDescription, Body: SheetBody, Footer: SheetFooter }
      : { Header: DialogHeader, Title: DialogTitle, Description: DialogDescription, Body: DialogBody, Footer: DialogFooter };

  const guards = {
    ...(description ? {} : { "aria-describedby": undefined }),
    onEscapeKeyDown: (event: KeyboardEvent) => {
      if (isSubmitting) event.preventDefault();
    },
    onInteractOutside: (event: Event) => {
      if (isSubmitting) event.preventDefault();
    },
  };

  const onRootOpenChange = (next: boolean) => {
    if (!next) void requestClose();
  };

  const content = (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <parts.Header>
        <parts.Title>{title}</parts.Title>
        {description ? <parts.Description>{description}</parts.Description> : null}
      </parts.Header>

      <parts.Body className="space-y-4">
        {formError ? <Alert>{formError}</Alert> : null}
        {result && renderSuccess ? renderSuccess(result.value) : children}
      </parts.Body>

      <parts.Footer>
        {result ? (
          <Button type="button" onClick={() => onOpenChange(false)}>
            تم
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => void requestClose()}
            >
              إلغاء
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {submitLabel}
            </Button>
          </>
        )}
      </parts.Footer>
    </form>
  );

  return presentation === "sheet" ? (
    <Sheet open={open} onOpenChange={onRootOpenChange}>
      <SheetContent side="end" width={size} {...guards}>
        {content}
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onRootOpenChange}>
      <DialogContent size={size} closeDisabled={isSubmitting} {...guards}>
        {content}
      </DialogContent>
    </Dialog>
  );
}

/** عنوان فرعي داخل نموذج طويل (مقاس `lg`) يقسمه أقسامًا. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="space-y-0.5" aria-hidden>
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}
