"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormDialog, FormSection } from "@/components/ui/form-dialog";
import { TextField, TextareaField } from "@/components/ui/form-fields";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createCharterVersion,
  publishCharterVersion,
  type CharterVersion,
} from "@/lib/api/partners";
import { formatDate } from "@/lib/utils";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function charterState(version: CharterVersion) {
  return version.isCurrent ? "CURRENT" : version.publishedAt ? "PUBLISHED" : "DRAFT";
}

/** كل طفرة على الميثاق تمسّ القائمة وشروط تفعيل الشركاء المبنية على الساري. */
function useCharterInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: ["charter-versions"] });
    void queryClient.invalidateQueries({ queryKey: ["partner"] });
  };
}

/** سطر لكل مبدأ أو التزام — أبسط مدخل لقائمة نصية قصيرة. */
function linesOf(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const linesSchema = (label: string) =>
  z
    .string()
    .refine((value) => linesOf(value).length <= 50, `خمسون ${label} على الأكثر.`)
    .refine(
      (value) => linesOf(value).every((line) => line.length >= 3 && line.length <= 300),
      `كل سطر من 3 إلى 300 حرف.`,
    );

const versionSchema = z.object({
  version: z.string().trim().min(1, "رقم الإصدار مطلوب.").max(20, "رقم الإصدار طويل جدًا."),
  titleAr: z.string().trim().min(3, "العنوان لا يقل عن ثلاثة أحرف.").max(200, "العنوان طويل جدًا."),
  summaryAr: z.string().trim().max(2000, "الملخص طويل جدًا."),
  bodyAr: z.string().trim().min(20, "نص الميثاق لا يقل عن عشرين حرفًا."),
  principlesAr: linesSchema("مبدأً"),
  commitmentsAr: linesSchema("التزامًا"),
});

type VersionValues = z.infer<typeof versionSchema>;

/**
 * إصدار جديد مسوّدةً، يبدأ من نص أحدث إصدار: التعديل على الميثاق مراجعة
 * لنص قائم أكثر منه كتابة من الصفر، ونسخه يدويًا كان يعني فقدان سطر.
 */
export function CharterVersionDialog({
  base,
  ...props
}: DialogProps & { base: CharterVersion | null }) {
  const invalidate = useCharterInvalidation();
  const form = useForm<VersionValues>({
    resolver: zodResolver(versionSchema),
    defaultValues: {
      version: "",
      titleAr: "ميثاق المدن الخضراء",
      summaryAr: "",
      bodyAr: "",
      principlesAr: "",
      commitmentsAr: "",
    },
  });

  return (
    <FormDialog
      {...props}
      size="lg"
      title="إصدار جديد من الميثاق"
      description={
        base
          ? `مبدوء من نص الإصدار ${base.version}. يُحفظ مسوّدةً ولا يصير مرجعًا للإقرارات حتى يُنشر.`
          : "يُحفظ مسوّدةً ولا يصير مرجعًا للإقرارات حتى يُنشر."
      }
      form={form}
      values={{
        version: "",
        titleAr: base?.titleAr ?? "ميثاق المدن الخضراء",
        summaryAr: base?.summaryAr ?? "",
        bodyAr: base?.bodyAr ?? "",
        principlesAr: base?.principlesAr.join("\n") ?? "",
        commitmentsAr: base?.commitmentsAr.join("\n") ?? "",
      }}
      submitLabel="حفظ المسوّدة"
      onSubmit={(values) =>
        createCharterVersion({
          version: values.version,
          titleAr: values.titleAr,
          bodyAr: values.bodyAr,
          principlesAr: linesOf(values.principlesAr),
          commitmentsAr: linesOf(values.commitmentsAr),
          ...(values.summaryAr ? { summaryAr: values.summaryAr } : {}),
        })
      }
      successMessage={(created) => `حُفظ الإصدار ${created.version} مسوّدةً.`}
      onSuccess={invalidate}
      fieldForError={(error) => (error.status === 409 ? "version" : null)}
    >
      <FormSection title="الإصدار">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <TextField
            control={form.control}
            name="version"
            label="رقم الإصدار"
            dir="ltr"
            className="text-start"
            placeholder={base ? `بعد ${base.version}` : "1.0"}
          />
          <TextField control={form.control} name="titleAr" label="العنوان" />
        </div>
        <TextareaField
          control={form.control}
          name="summaryAr"
          label="ملخص (اختياري)"
          hint="سطران يسبقان النص الكامل لمن يقرّ به."
          rows={2}
        />
      </FormSection>
      <FormSection title="النص">
        <TextareaField control={form.control} name="bodyAr" label="نص الميثاق" rows={8} />
      </FormSection>
      <FormSection title="المبادئ والالتزامات" description="سطر لكل بند.">
        <TextareaField control={form.control} name="principlesAr" label="المبادئ" rows={5} />
        <TextareaField control={form.control} name="commitmentsAr" label="التزامات الشركاء" rows={5} />
      </FormSection>
    </FormDialog>
  );
}

const publishSchema = z.object({ effectiveFrom: z.string() });

type PublishValues = z.infer<typeof publishSchema>;

/**
 * النشر نهائي — المنشور لا يُعدَّل — فهو نافذة تأكيد بحقل واحد: تاريخ
 * السريان، القائم في الـAPI ولم تكن له واجهة. بلا تاريخ يسري فورًا.
 */
export function PublishCharterDialog({
  version,
  ...props
}: DialogProps & { version: CharterVersion | null }) {
  const invalidate = useCharterInvalidation();
  const form = useForm<PublishValues>({
    resolver: zodResolver(publishSchema),
    defaultValues: { effectiveFrom: "" },
  });

  return (
    <FormDialog
      {...props}
      size="sm"
      title={version ? `نشر الإصدار ${version.version}؟` : "نشر الإصدار؟"}
      description="يُجمَّد نصه ولا يُعدَّل بعد النشر، ويصير مرجع الإقرارات الجديدة وشرط تفعيل الشركاء من تاريخ سريانه."
      form={form}
      values={{ effectiveFrom: "" }}
      submitLabel="نشر الإصدار"
      onSubmit={(values) =>
        publishCharterVersion(
          version!.id,
          // منتصف اليوم لا منتصف الليل: يقع في اليوم نفسه بأي منطقة زمنية.
          values.effectiveFrom ? new Date(`${values.effectiveFrom}T12:00:00`).toISOString() : undefined,
        )
      }
      successMessage={(published) => `نُشر الإصدار ${published.version}.`}
      onSuccess={invalidate}
    >
      <TextField
        control={form.control}
        name="effectiveFrom"
        label="يسري من (اختياري)"
        hint="اتركه فارغًا ليسري فور النشر."
        type="date"
        dir="ltr"
        className="w-48 text-start"
      />
    </FormDialog>
  );
}

/** النص الكامل للقراءة: كان يُعرض عدد المبادئ والالتزامات وحده. */
export function CharterTextSheet({
  version,
  ...props
}: DialogProps & { version: CharterVersion | null }) {
  return (
    <Sheet {...props}>
      <SheetContent side="end" width="lg">
        <SheetHeader>
          <SheetTitle>{version?.titleAr ?? "الميثاق"}</SheetTitle>
          <SheetDescription>
            {version
              ? `الإصدار ${version.version}${version.effectiveFrom ? ` · يسري من ${formatDate(version.effectiveFrom)}` : ""}`
              : " "}
          </SheetDescription>
          {version ? (
            <div className="pt-1">
              <StatusBadge kind="charterState" value={charterState(version)} />
            </div>
          ) : null}
        </SheetHeader>
        <SheetBody className="space-y-6 text-sm leading-relaxed">
          {version ? (
            <>
              {version.summaryAr ? (
                <p className="text-base text-muted-foreground">{version.summaryAr}</p>
              ) : null}
              <div className="space-y-3">
                {version.bodyAr.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
              {version.principlesAr.length > 0 ? (
                <section className="space-y-2" aria-labelledby="charter-principles">
                  <h3 id="charter-principles" className="font-semibold">
                    المبادئ
                  </h3>
                  <ol className="list-decimal space-y-1 ps-5">
                    {version.principlesAr.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ol>
                </section>
              ) : null}
              {version.commitmentsAr.length > 0 ? (
                <section className="space-y-2" aria-labelledby="charter-commitments">
                  <h3 id="charter-commitments" className="font-semibold">
                    التزامات الشركاء
                  </h3>
                  <ol className="list-decimal space-y-1 ps-5">
                    {version.commitmentsAr.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
