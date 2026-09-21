"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField, TextField, TextareaField } from "@/components/ui/form-fields";
import type { SelectSource } from "@/components/ui/select";
import { listInitiatives } from "@/lib/api/initiatives";
import { listOffices } from "@/lib/api/invitations";
import { listPeople } from "@/lib/api/people";
import {
  assignTask,
  createTask,
  updateTask,
  type WorkItemSummary,
  type WorkPriority,
} from "@/lib/api/work";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { statusOptions } from "@/lib/status";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** كل طفرة على مهمة تمسّ القوائم الثلاث والرئيسية معًا. */
export function useTaskInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: ["work"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

/**
 * الأعضاء يُبحثون في الخادم: دليل الفريق يكبر، والإسناد يحتاج اسمًا واحدًا.
 * القائمة تحتاج `users.view`، فمن لا يملكها لا يرى حقل المسؤول أصلًا.
 */
export const PEOPLE_SOURCE: SelectSource = {
  queryKey: ["people", "assignable"],
  load: (query) =>
    listPeople({ status: "ACTIVE", q: query || undefined }).then((people) =>
      people.map((person) => ({ value: person.id, label: person.fullNameAr, description: person.email })),
    ),
};

const INITIATIVE_SOURCE: SelectSource = {
  queryKey: ["initiatives", "task-scope"],
  load: (query) =>
    listInitiatives({ q: query || undefined }).then((initiatives) =>
      initiatives
        .filter((initiative) => initiative.status !== "CANCELLED" && initiative.status !== "COMPLETED")
        .map((initiative) => ({
          value: initiative.id,
          label: initiative.nameAr,
          description: initiative.season ?? initiative.programNameAr,
        })),
    ),
};

/** حقل التاريخ والوقت المحلي يعطي «2026-09-21T14:30» بلا منطقة زمنية. */
function toLocalInput(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

const PRIORITY_OPTIONS = statusOptions("workPriority");

// ── إنشاء مهمة ──────────────────────────────────────────────────────────

const taskShape = {
  titleAr: z.string().trim().min(3, "عنوان المهمة لا يقل عن ثلاثة أحرف.").max(300, "العنوان طويل جدًا."),
  priority: z.string(),
  dueAt: z.string(),
  descriptionAr: z.string().trim().max(4000, "التفاصيل طويلة جدًا."),
};

/**
 * حقلان للجهة لا حقل يُفرَّغ عند تبديل نوعها: أسماؤهما أسماء العقد نفسها
 * (`officeId`، `initiativeId`) فتصل أخطاء الخادم إلى الحقل الصحيح، ولا
 * يمسح تبديلُ النوع ما اختير في الآخر.
 */
const createSchema = z
  .object({
    ...taskShape,
    scopeKind: z.enum(["OFFICE", "INITIATIVE"]),
    officeId: z.string(),
    initiativeId: z.string(),
    assigneeUserId: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.scopeKind === "OFFICE" && !values.officeId) {
      ctx.addIssue({ code: "custom", path: ["officeId"], message: "اختر المكتب." });
    }

    if (values.scopeKind === "INITIATIVE" && !values.initiativeId) {
      ctx.addIssue({ code: "custom", path: ["initiativeId"], message: "اختر المبادرة." });
    }
  });

type CreateValues = z.infer<typeof createSchema>;

/** كانت بطاقة نموذج تُفتح فوق القائمة؛ صارت نافذة. */
export function TaskCreateDialog({
  defaultOfficeId,
  ...props
}: DialogProps & { defaultOfficeId: string | undefined }) {
  const { user, can } = useAuth();
  const invalidate = useTaskInvalidation();
  const canPickPeople = can(CAPABILITIES.usersView);
  const offices = useQuery({ queryKey: ["offices"], queryFn: listOffices, enabled: props.open });
  const defaults: CreateValues = {
    // المكتب الرئيس هو الافتراض: أكثر ما يُنشأ يدويًا عمل مكتبك.
    scopeKind: "OFFICE",
    officeId: defaultOfficeId ?? "",
    initiativeId: "",
    titleAr: "",
    priority: "NORMAL",
    assigneeUserId: "",
    dueAt: "",
    descriptionAr: "",
  };
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: defaults,
  });
  const scopeKind = useWatch({ control: form.control, name: "scopeKind" });

  return (
    <FormDialog
      {...props}
      size="md"
      title="إنشاء مهمة"
      description="عمل يدوي على مكتب أو مبادرة. مهام القوالب تُولَّد وحدها مع المبادرة."
      form={form}
      values={defaults}
      submitLabel="إنشاء المهمة"
      onSubmit={(values) => {
        const dueAt = fromLocalInput(values.dueAt);

        return createTask({
          ...(values.scopeKind === "OFFICE"
            ? { officeId: values.officeId }
            : { initiativeId: values.initiativeId }),
          titleAr: values.titleAr,
          priority: values.priority as WorkPriority,
          ...(values.assigneeUserId ? { assigneeUserId: values.assigneeUserId } : {}),
          ...(dueAt ? { dueAt } : {}),
          ...(values.descriptionAr ? { descriptionAr: values.descriptionAr } : {}),
        });
      }}
      // مهمة أُسندت إلى غيرك لا تظهر في «مهامي»، فيُقال أين ذهبت بدل أن
      // يبدو الإنشاء بلا أثر.
      successMessage={(task) =>
        !task.assigneeUserId
          ? `أُنشئت «${task.titleAr}» بلا مسؤول — تنتظر في بركة جهتها.`
          : task.assigneeUserId === user?.id
            ? `أُنشئت «${task.titleAr}» ضمن مهامك.`
            : `أُنشئت «${task.titleAr}» وأُسندت إلى ${task.assigneeNameAr}.`
      }
      onSuccess={invalidate}
    >
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <SelectField
          control={form.control}
          name="scopeKind"
          label="جهة المهمة"
          options={[
            { value: "OFFICE", label: "مكتب" },
            { value: "INITIATIVE", label: "مبادرة" },
          ]}
        />
        {scopeKind === "OFFICE" ? (
          <SelectField
            key="office"
            control={form.control}
            name="officeId"
            label="المكتب"
            loading={offices.isPending}
            options={(offices.data ?? []).map((office) => ({ value: office.id, label: office.nameAr }))}
          />
        ) : (
          <SelectField
            key="initiative"
            control={form.control}
            name="initiativeId"
            label="المبادرة"
            source={INITIATIVE_SOURCE}
          />
        )}
      </div>
      <TextField control={form.control} name="titleAr" label="عنوان المهمة" maxLength={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="priority"
          label="الأولوية"
          options={PRIORITY_OPTIONS}
        />
        <TextField
          control={form.control}
          name="dueAt"
          label="الموعد (اختياري)"
          type="datetime-local"
          dir="ltr"
          className="text-start"
        />
      </div>
      {canPickPeople ? (
        <SelectField
          control={form.control}
          name="assigneeUserId"
          label="المسؤول (اختياري)"
          hint="بلا مسؤول تنتظر المهمة في بركة جهتها حتى يلتقطها أحد."
          clearable
          placeholder="بلا مسؤول"
          source={PEOPLE_SOURCE}
        />
      ) : null}
      <TextareaField control={form.control} name="descriptionAr" label="التفاصيل (اختيارية)" rows={3} />
    </FormDialog>
  );
}

// ── تعديل مهمة ──────────────────────────────────────────────────────────

const editSchema = z.object(taskShape);

type EditValues = z.infer<typeof editSchema>;

/** تحرير المهمة — مسار `PATCH` كان يُستعمل للإسناد وحده. */
export function TaskEditDialog({ task, ...props }: DialogProps & { task: WorkItemSummary }) {
  const invalidate = useTaskInvalidation();
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { titleAr: "", priority: "NORMAL", dueAt: "", descriptionAr: "" },
  });

  return (
    <FormDialog
      {...props}
      size="md"
      title={`تعديل «${task.titleAr}»`}
      form={form}
      values={{
        titleAr: task.titleAr,
        priority: task.priority,
        dueAt: toLocalInput(task.dueAt),
        descriptionAr: task.descriptionAr ?? "",
      }}
      submitLabel="حفظ المهمة"
      onSubmit={(values) =>
        updateTask(task.id, {
          titleAr: values.titleAr,
          priority: values.priority as WorkPriority,
          dueAt: fromLocalInput(values.dueAt),
          descriptionAr: values.descriptionAr || null,
        })
      }
      successMessage="حُفظت المهمة."
      onSuccess={invalidate}
    >
      <TextField control={form.control} name="titleAr" label="عنوان المهمة" maxLength={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField control={form.control} name="priority" label="الأولوية" options={PRIORITY_OPTIONS} />
        <TextField
          control={form.control}
          name="dueAt"
          label="الموعد"
          type="datetime-local"
          dir="ltr"
          className="text-start"
        />
      </div>
      <TextareaField control={form.control} name="descriptionAr" label="التفاصيل" rows={4} />
    </FormDialog>
  );
}

// ── إسناد مهمة ──────────────────────────────────────────────────────────

const assignSchema = z.object({ assigneeUserId: z.string() });

type AssignValues = z.infer<typeof assignSchema>;

/**
 * كان الإسناد قائمة منسدلة في كل صف تحفظ عند التغيير، فلا يُفرَّق بين
 * التصفح والحفظ. صار نافذة صغيرة بحقل بحث؛ والمسح يعيد المهمة إلى بركة
 * جهتها.
 */
export function TaskAssignDialog({ task, ...props }: DialogProps & { task: WorkItemSummary }) {
  const invalidate = useTaskInvalidation();
  const form = useForm<AssignValues>({
    resolver: zodResolver(assignSchema),
    defaultValues: { assigneeUserId: "" },
  });

  return (
    <FormDialog
      {...props}
      size="sm"
      title={`إسناد «${task.titleAr}»`}
      form={form}
      values={{ assigneeUserId: task.assigneeUserId ?? "" }}
      submitLabel="حفظ الإسناد"
      onSubmit={(values) => assignTask(task.id, values.assigneeUserId || null)}
      successMessage={() => "حُفظ الإسناد."}
      onSuccess={invalidate}
    >
      <SelectField
        control={form.control}
        name="assigneeUserId"
        label="المسؤول"
        hint="امسح الاختيار لتعود المهمة إلى بركة جهتها بلا مسؤول."
        clearable
        placeholder="بلا مسؤول"
        source={PEOPLE_SOURCE}
        // من أُسندت إليه يبقى ظاهرًا ولو خرج من الأعضاء النشطين، وإلا بدت
        // المهمة بلا مسؤول وهي مسندة فأُسندت مرتين.
        selectedOption={
          task.assigneeUserId
            ? { value: task.assigneeUserId, label: task.assigneeNameAr ?? "المسؤول الحالي" }
            : undefined
        }
      />
    </FormDialog>
  );
}
