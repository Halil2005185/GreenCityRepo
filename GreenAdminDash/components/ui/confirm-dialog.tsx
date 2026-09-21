"use client";

import { createContext, useCallback, useContext, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Label } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/errors";

export type ConfirmOptions = {
  /** سؤال يسمّي الكيان: «إلغاء الدعوة المرسلة إلى …؟» */
  title: string;
  /** أثر الفعل بجملة: ما الذي سيختفي، وما الذي يبقى. */
  description?: React.ReactNode;
  /** محتوى إضافي تحت الوصف — تحذيرات المطابقة قبل الإطلاق مثلًا. */
  details?: React.ReactNode;
  /** فعل واسم كما في الزر الذي فتح النافذة: «إلغاء الدعوة». */
  confirmLabel: string;
  /** «تراجع» لا «إلغاء»: الفعل نفسه كثيرًا ما يكون «إلغاء». */
  cancelLabel?: string;
  destructive?: boolean;
  /** سبب يُطلب داخل النافذة نفسها (التعليق، تعثّر المهمة). */
  reason?: { label: string; placeholder?: string; minLength?: number };
  /**
   * التنفيذ داخل النافذة: تبقى مفتوحة بحالة تحميل، ويظهر الفشل فيها بدل
   * أن تُغلق ويضيع الخطأ في مكان آخر.
   */
  onConfirm?: (context: { reason: string }) => Promise<unknown> | unknown;
  successMessage?: string;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * `const confirm = useConfirm()` ثم `if (await confirm({...}))` — بديل
 * `window.confirm` بنافذة تسمّي الكيان وتشرح الأثر، وتعمل بلوحة المفاتيح
 * وتعيد التركيز إلى الزر الذي فتحها.
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);

  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>.");

  return confirm;
}

type Request = {
  id: number;
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);
  const counter = useRef(0);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        counter.current += 1;
        setRequest({ id: counter.current, options, resolve });
        setOpen(true);
      }),
    [],
  );

  return (
    <ConfirmContext value={confirm}>
      {children}
      {request ? (
        <ConfirmView
          // مفتاح لكل طلب: حقل السبب وحالة الخطأ يبدآن فارغين في كل مرة.
          key={request.id}
          request={request}
          open={open}
          onClose={(confirmed) => {
            request.resolve(confirmed);
            setOpen(false);
          }}
        />
      ) : null}
    </ConfirmContext>
  );
}

function ConfirmView({
  request,
  open,
  onClose,
}: {
  request: Request;
  open: boolean;
  onClose: (confirmed: boolean) => void;
}) {
  const { options } = request;
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const minLength = options.reason?.minLength ?? 3;
  const reasonInvalid = Boolean(options.reason) && reason.trim().length < minLength;

  async function confirm() {
    if (reasonInvalid) {
      setTouched(true);
      reasonRef.current?.focus();
      return;
    }

    if (!options.onConfirm) {
      onClose(true);
      return;
    }

    setPending(true);
    setError(null);

    try {
      await options.onConfirm({ reason: reason.trim() });
      if (options.successMessage) toast.success(options.successMessage);
      onClose(true);
    } catch (caught) {
      setError(errorMessage(caught, "تعذّر تنفيذ الإجراء. حاول مجددًا."));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // لا إغلاق أثناء التنفيذ: الطلب ماضٍ، والنافذة تُبلغ بنتيجته.
        if (!next && !pending) onClose(false);
      }}
    >
      <AlertDialogContent
        {...(options.description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          // بسبب يُكتب يبدأ التركيز في حقله؛ وإلا يضعه Radix على «تراجع» لا
          // على الفعل الهدّام، فلا تحذف Enter طائشة شيئًا.
          if (options.reason) {
            event.preventDefault();
            reasonRef.current?.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <div className="space-y-3 px-5 pb-4 pt-5">
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : null}
            {options.details}

            {error ? <Alert>{error}</Alert> : null}

            {options.reason ? (
              <div className="space-y-1.5">
                <Label htmlFor={reasonId}>{options.reason.label}</Label>
                <Textarea
                  ref={reasonRef}
                  id={reasonId}
                  rows={3}
                  value={reason}
                  placeholder={options.reason.placeholder}
                  onChange={(event) => setReason(event.target.value)}
                  onBlur={() => setTouched(true)}
                  aria-invalid={touched && reasonInvalid}
                  aria-describedby={touched && reasonInvalid ? `${reasonId}-error` : undefined}
                />
                {touched && reasonInvalid ? (
                  <p id={`${reasonId}-error`} className="text-xs text-destructive" role="alert">
                    اكتب السبب ({minLength} أحرف على الأقل).
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {options.cancelLabel ?? "تراجع"}
              </Button>
            </AlertDialogCancel>
            <Button
              type="submit"
              variant={options.destructive ? "destructive" : "default"}
              loading={pending}
            >
              {options.confirmLabel}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
