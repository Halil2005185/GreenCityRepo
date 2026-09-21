"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { officeOptions, useOffices } from "@/components/offices/office-options";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField, TextField } from "@/components/ui/form-fields";
import { OneTimeLink } from "@/components/ui/one-time-link";
import { createForm } from "@/lib/api/forms";
import { latinize } from "@/lib/text/slug";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * أصل الموقع العام — منه يُبنى رابط التسجيل الذي يُنشر للناس.
 *
 * يُقرأ من البيئة لا يُكتب في الكود: اللوحة تعمل محليًا وعلى الإنتاج
 * بنفس الحزمة، ورابط `localhost` يُنسخ ويُرسل فلا يفتح عند أحد.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/**
 * الرابط العام لاستمارة منشورة، أو `null` إن لم تُنشر بعد أو لم يُضبط
 * عنوان الموقع — رابطٌ إلى استمارة غير منشورة يعطي 404 لمن يفتحه.
 */
export function publicUrlOf(form: { slug: string; publishedVersion: number | null }) {
  if (!SITE_URL || !form.publishedVersion) return null;

  return `${SITE_URL.replace(/\/$/, "")}/join/${form.slug}`;
}

/** سبب غياب الرابط بجملة واحدة، لزرّ معطّل أو خانة فارغة. */
export function missingUrlReason(form: { publishedVersion: number | null }) {
  return form.publishedVersion
    ? "عنوان الموقع العام غير مضبوط في إعدادات اللوحة."
    : "يظهر الرابط بعد نشر أول إصدار.";
}

/** معرّف الرابط بقواعد الخادم: يبدأ بحرف لاتيني. */
function suggestSlug(nameAr: string) {
  const base = latinize(nameAr).slice(0, 60);

  return /^[a-z]/.test(base) ? base : base ? `form-${base}` : "";
}

const createSchema = z.object({
  nameAr: z.string().trim().min(2, "اسم الاستمارة مطلوب.").max(160, "الاسم طويل جدًا."),
  slug: z.union([
    z
      .string()
      .trim()
      .min(2, "المعرّف قصير جدًا.")
      .max(60, "المعرّف طويل جدًا.")
      .regex(/^[a-z][a-z0-9-]*$/, "يبدأ بحرف لاتيني صغير، ثم حروف صغيرة وأرقام وشرطات."),
    z.literal(""),
  ]),
  descriptionAr: z.string().trim().max(1000, "الوصف طويل جدًا."),
  officeId: z.string(),
});

type CreateValues = z.infer<typeof createSchema>;

const EMPTY: CreateValues = { nameAr: "", slug: "", descriptionAr: "", officeId: "" };

/**
 * كانت بطاقة نموذج دائمة أعلى قائمة الاستمارات؛ صارت نافذة، وبعد الإنشاء
 * يُفتح محرّر الأسئلة مباشرة لأن الاستمارة بلا أسئلة لا تُنشر.
 */
export function FormCreateDialog(props: DialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const offices = useOffices();
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: EMPTY,
  });
  const nameAr = useWatch({ control: form.control, name: "nameAr" });
  const suggested = suggestSlug(nameAr);

  return (
    <FormDialog
      {...props}
      size="md"
      title="إنشاء استمارة"
      description="تُنشأ مسوّدتها فورًا. الأسئلة تُحرَّر في المسوّدة، والمنشور مجمَّد لا يُعدَّل — لأن طلبًا قديمًا يجب أن يبقى مقروءًا مقابل الأسئلة كما سُئلت يومها."
      form={form}
      values={EMPTY}
      submitLabel="إنشاء الاستمارة"
      onSubmit={(values) =>
        createForm({
          nameAr: values.nameAr,
          slug: values.slug || suggestSlug(values.nameAr) || "form",
          ...(values.descriptionAr ? { descriptionAr: values.descriptionAr } : {}),
          ...(values.officeId ? { officeId: values.officeId } : {}),
        })
      }
      successMessage={(created) => `أُنشئت «${created.nameAr}».`}
      onSuccess={(created) => {
        void queryClient.invalidateQueries({ queryKey: ["forms"] });
        router.push(`/dashboard/forms/${created.id}/edit`);
      }}
      fieldForError={(error) => (error.status === 409 ? "slug" : null)}
    >
      <TextField control={form.control} name="nameAr" label="اسم الاستمارة" placeholder="استمارة الانضمام" />
      <TextField
        control={form.control}
        name="slug"
        label="المعرّف في الرابط (اختياري)"
        hint="يظهر في عنوان الاستمارة العلني. اتركه فارغًا ليُشتق من الاسم."
        dir="ltr"
        className="text-start font-mono"
        placeholder={suggested || "join"}
      />
      <TextField control={form.control} name="descriptionAr" label="وصف مختصر (اختياري)" />
      <SelectField
        control={form.control}
        name="officeId"
        label="المكتب المسؤول عن الفرز (اختياري)"
        clearable
        placeholder="بلا مكتب"
        loading={offices.isPending}
        options={officeOptions(offices.data ?? [])}
      />
    </FormDialog>
  );
}

/**
 * رابط التسجيل في نافذة لا في الحافظة وحدها: نسخٌ يفشل بصمت في متصفح يمنع
 * الحافظة كان يُسدّ بـ`window.prompt`؛ هنا الرابط ظاهر يُنسخ أو يُفتح.
 */
export function RegistrationLinkDialog({
  form,
  ...props
}: DialogProps & { form: { nameAr: string; slug: string; publishedVersion: number | null } | null }) {
  const url = form ? publicUrlOf(form) : null;

  return (
    <Dialog {...props}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>رابط التسجيل</DialogTitle>
          <DialogDescription>{form ? `الرابط العلني لـ«${form.nameAr}».` : null}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {url ? (
            <>
              <OneTimeLink url={url} note="انشر هذا الرابط لمن تريد أن يتقدّم." />
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({ variant: "link", size: "sm", className: "px-0" })}
              >
                <ExternalLink aria-hidden />
                فتح الاستمارة في تبويب جديد
              </a>
            </>
          ) : form ? (
            <p className="text-sm text-muted-foreground">{missingUrlReason(form)}</p>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
