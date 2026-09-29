"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { type FieldPath, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { fieldKey } from "@/components/field/group-dialog";
import { IconButton } from "@/components/ui/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/ui/form-dialog";
import { SelectField, TextField } from "@/components/ui/form-fields";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchInput } from "@/components/ui/toolbar";
import {
  addGroupMembers,
  listApplicantSources,
  listApplicants,
  searchParticipants,
  type FieldAddMembersResult,
  type FieldGroup,
} from "@/lib/api/field";
import { countAr } from "@/lib/text/plural-ar";
import { normalizeArabic } from "@/lib/text/normalize-ar";
import { cn } from "@/lib/utils";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export const membersKey = (initiativeId: string, groupId: string) =>
  ["field-members", initiativeId, groupId] as const;

/** كما يفحصه الخادم: أرقام ومسافات وأقواس وشرطة، بعلامة `+` في أوله أو بلا. */
const PHONE_PATTERN = /^[+]?[0-9\s()-]{6,32}$/;

const personSchema = z.object({
  fullNameAr: z.string().trim().max(160, "الاسم طويل جدًا."),
  phone: z.string().trim(),
  email: z.string().trim().max(254, "البريد طويل جدًا."),
});

type Person = z.infer<typeof personSchema>;

/** صف لم يُكتب فيه شيء يُتجاهل: النموذج يبدأ بصف فارغ جاهز للكتابة. */
const isBlank = (person: Person) =>
  !person.fullNameAr.trim() && !person.phone.trim() && !person.email.trim();

const schema = z
  .object({
    formId: z.string(),
    submissionIds: z.array(z.string()),
    participantIds: z.array(z.string()),
    people: z.array(personSchema),
  })
  .superRefine((values, context) => {
    values.people.forEach((person, index) => {
      if (isBlank(person)) return;

      if (person.fullNameAr.trim().length < 2) {
        context.addIssue({
          code: "custom",
          path: ["people", index, "fullNameAr"],
          message: "اكتب الاسم الكامل.",
        });
      }

      const phone = normalizeArabic(person.phone);

      if (phone && !PHONE_PATTERN.test(phone)) {
        context.addIssue({
          code: "custom",
          path: ["people", index, "phone"],
          message: "اكتب الرقم بأرقامه، مثل 0944123456.",
        });
      }

      if (person.email && !z.email().safeParse(person.email).success) {
        context.addIssue({
          code: "custom",
          path: ["people", index, "email"],
          message: "صيغة البريد غير صحيحة.",
        });
      }
    });

    const chosen =
      values.submissionIds.length +
      values.participantIds.length +
      values.people.filter((person) => !isBlank(person)).length;

    if (chosen === 0) {
      context.addIssue({
        code: "custom",
        path: ["formId"],
        message: "اختر من يُضاف إلى المجموعة، أو اكتب اسمه.",
      });
    }
  });

type Values = z.infer<typeof schema>;

const BLANK: Person = { fullNameAr: "", phone: "", email: "" };

const EMPTY: Values = {
  formId: "",
  submissionIds: [],
  participantIds: [],
  people: [BLANK],
};

const PEOPLE = {
  one: "شخص واحد",
  two: "شخصان",
  few: "أشخاص",
  many: "شخصًا",
  other: "شخص",
};

/**
 * إضافة أعضاء إلى مجموعة من ثلاثة مصادر في طلب واحد: المقبولون في استمارة،
 * وسجل المشاركين، وإدخال يدوي.
 *
 * المصادر تبويبات لا نوافذ: المنسّق يختار عشرة من الاستمارة ويكتب اسمين
 * جاءا بالهاتف، ثم يضيف الجميع مرة واحدة.
 */
export function AddMembersDialog({
  initiativeId,
  group,
  ...props
}: DialogProps & { initiativeId: string; group: FieldGroup }) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const [tab, setTab] = useState("form");

  const values = useWatch({ control: form.control });
  const typed = (values.people ?? []).filter(
    (person) => !isBlank({ ...BLANK, ...person }),
  ).length;
  const chosen =
    (values.submissionIds?.length ?? 0) + (values.participantIds?.length ?? 0) + typed;

  return (
    <FormDialog<Values, FieldAddMembersResult>
      {...props}
      size="lg"
      title={`إضافة أعضاء إلى «${group.nameAr}»`}
      description="من سبق تسجيله يُعرف باسمه مع هاتفه أو بريده، فلا يتكرر في السجل."
      form={form}
      values={EMPTY}
      submitLabel={chosen > 0 ? `إضافة ${countAr(chosen, PEOPLE)}` : "إضافة إلى المجموعة"}
      onSubmit={(submitted) => {
        const people = submitted.people
          .filter((person) => !isBlank(person))
          .map((person) => ({
            fullNameAr: person.fullNameAr.trim(),
            ...(person.phone ? { phone: normalizeArabic(person.phone) } : {}),
            ...(person.email ? { email: person.email } : {}),
          }));

        return addGroupMembers(initiativeId, group.id, {
          ...(submitted.submissionIds.length > 0
            ? { formId: submitted.formId, submissionIds: submitted.submissionIds }
            : {}),
          ...(submitted.participantIds.length > 0
            ? { participantIds: submitted.participantIds }
            : {}),
          ...(people.length > 0 ? { people } : {}),
        });
      }}
      onSuccess={({ groupId, day, members }) => {
        queryClient.setQueryData(membersKey(initiativeId, group.id), { groupId, day, members });
        void queryClient.invalidateQueries({ queryKey: fieldKey(initiativeId) });
        // المقبول الذي أُضيف صار له مجموعة: قائمة المقبولين تُقرأ من جديد.
        void queryClient.invalidateQueries({ queryKey: ["field-applicants", initiativeId] });
      }}
      renderSuccess={(result) => <Summary result={result} />}
      // الطلبات المرفوضة كلها (422) تخص الاختيار، لا حقلًا بعينه.
      mapFieldPath={(path) =>
        path.startsWith("people.") ? (path as FieldPath<Values>) : "formId"
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="مصدر الأعضاء">
          <TabsTrigger value="form">
            مقبولو استمارة
            <Count value={values.submissionIds?.length ?? 0} />
          </TabsTrigger>
          <TabsTrigger value="registry">
            سجل المشاركين
            <Count value={values.participantIds?.length ?? 0} />
          </TabsTrigger>
          <TabsTrigger value="manual">
            إدخال يدوي
            <Count value={typed} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-3">
          <Applicants
            initiativeId={initiativeId}
            group={group}
            form={form}
            open={props.open}
          />
        </TabsContent>

        <TabsContent value="registry" className="space-y-3">
          <Registry initiativeId={initiativeId} group={group} form={form} />
        </TabsContent>

        <TabsContent value="manual" className="space-y-3">
          <Manual form={form} />
        </TabsContent>
      </Tabs>

      {form.formState.errors.formId?.message && tab !== "form" ? (
        // خطأ «لم تختر أحدًا» يخص النموذج كله، فيظهر في أي تبويب كان المنسّق.
        <Alert>{form.formState.errors.formId.message}</Alert>
      ) : null}
    </FormDialog>
  );
}

function Count({ value }: { value: number }) {
  if (value === 0) return null;

  return (
    <span className="numeric rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
      {value}
    </span>
  );
}

type FormApi = ReturnType<typeof useForm<Values>>;

function toggle(form: FormApi, name: "submissionIds" | "participantIds", ids: string[], on: boolean) {
  const current = new Set(form.getValues(name));

  for (const id of ids) {
    if (on) current.add(id);
    else current.delete(id);
  }

  form.setValue(name, [...current], { shouldDirty: true, shouldValidate: form.formState.isSubmitted });

  if (on) form.clearErrors("formId");
}

// ── مقبولو استمارة ──────────────────────────────────────────────────────

function Applicants({
  initiativeId,
  group,
  form,
  open,
}: {
  initiativeId: string;
  group: FieldGroup;
  form: FormApi;
  open: boolean;
}) {
  const [search, setSearch] = useState("");
  const formId = useWatch({ control: form.control, name: "formId" });
  const selected = useWatch({ control: form.control, name: "submissionIds" });

  // الطلبات تُرسَل مع استمارتها: تبديل الاستمارة يُسقط ما اختير من سابقتها.
  const chosenFor = useRef(formId);

  useEffect(() => {
    if (chosenFor.current === formId) return;

    chosenFor.current = formId;
    form.setValue("submissionIds", []);
  }, [formId, form]);

  const sources = useQuery({
    queryKey: ["field-applicant-sources", initiativeId],
    queryFn: () => listApplicantSources(initiativeId),
    enabled: open,
    staleTime: 60_000,
  });

  const applicants = useQuery({
    queryKey: ["field-applicants", initiativeId, formId, search],
    queryFn: ({ signal }) => listApplicants(initiativeId, formId, search || undefined, signal),
    enabled: open && Boolean(formId),
    placeholderData: keepPreviousData,
  });

  const items = (applicants.data ?? []).map((applicant) => {
    const here = applicant.groupNamesAr.includes(group.nameAr);

    return {
      id: applicant.submissionId,
      label: applicant.fullNameAr ?? "طلب بلا اسم",
      description: [applicant.phone, applicant.email].filter(Boolean).join(" · "),
      note: here
        ? "عضو في هذه المجموعة"
        : applicant.groupNamesAr.length > 0
          ? `في: ${applicant.groupNamesAr.join("، ")}`
          : null,
      // بلا اسم لا يصير مشاركًا، ومن في المجموعة لا يُضاف ثانية.
      disabled: here || !applicant.fullNameAr,
    };
  });

  return (
    <>
      <SelectField
        control={form.control}
        name="formId"
        label="الاستمارة"
        placeholder="اختر استمارة فيها مقبولون"
        options={(sources.data ?? []).map((source) => ({
          value: source.formId,
          label: source.nameAr,
          description: `المقبولون: ${source.acceptedCount}`,
        }))}
        loading={sources.isPending && open}
        hint={
          sources.data && sources.data.length === 0
            ? "لا استمارة فيها طلبات مقبولة بعد. اقبل الطلبات من صندوق الاستمارة أولًا."
            : undefined
        }
      />

      {formId ? (
        <>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث بالاسم أو الهاتف"
            label="ابحث في المقبولين"
          />
          <PickList
            caption="المقبولون في الاستمارة"
            items={items}
            selected={selected}
            loading={applicants.isPending}
            error={applicants.isError}
            empty={search ? "لا مقبول بهذا الاسم." : "لا طلبات مقبولة في هذه الاستمارة."}
            onToggle={(ids, on) => toggle(form, "submissionIds", ids, on)}
          />
        </>
      ) : null}
    </>
  );
}

// ── سجل المشاركين ───────────────────────────────────────────────────────

function Registry({
  initiativeId,
  group,
  form,
}: {
  initiativeId: string;
  group: FieldGroup;
  form: FormApi;
}) {
  const [search, setSearch] = useState("");
  const selected = useWatch({ control: form.control, name: "participantIds" });
  const ready = search.trim().length >= 2;

  const found = useQuery({
    queryKey: ["field-participants", initiativeId, search],
    queryFn: ({ signal }) => searchParticipants(initiativeId, search, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  const items = (found.data ?? []).map((participant) => {
    const here = participant.groupNamesAr.includes(group.nameAr);

    return {
      id: participant.id,
      label: participant.fullNameAr,
      description: [participant.phone, participant.email].filter(Boolean).join(" · "),
      note: here
        ? "عضو في هذه المجموعة"
        : [
            participant.attendedDays > 0
              ? `حضر ${countAr(participant.attendedDays, DAYS)}`
              : null,
            participant.groupNamesAr.length > 0
              ? `في: ${participant.groupNamesAr.join("، ")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
      disabled: here,
    };
  });

  return (
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="ابحث بالاسم أو الهاتف"
        label="ابحث في سجل المشاركين"
      />

      {ready ? (
        <PickList
          caption="نتائج البحث في سجل المشاركين"
          items={items}
          selected={selected}
          loading={found.isPending}
          error={found.isError}
          empty="لا أحد في السجل بهذا الاسم. أضفه من «إدخال يدوي»."
          onToggle={(ids, on) => toggle(form, "participantIds", ids, on)}
        />
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          من شارك في مبادرة سابقة محفوظ في السجل. اكتب حرفين من اسمه أو أرقامًا
          من هاتفه.
        </p>
      )}

      {selected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          اختير من السجل: <span className="numeric">{selected.length}</span>. يبقى
          اختيارك وإن بحثت عن غيره.
        </p>
      ) : null}
    </>
  );
}

const DAYS = { one: "يومًا", two: "يومين", few: "أيام", many: "يومًا", other: "يوم" };

// ── إدخال يدوي ──────────────────────────────────────────────────────────

function Manual({ form }: { form: FormApi }) {
  const rows = useFieldArray({ control: form.control, name: "people" });

  return (
    <>
      <ul className="space-y-3">
        {rows.fields.map((row, index) => (
          <li
            key={row.id}
            className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1.4fr_1fr_1.2fr_auto] sm:items-start"
          >
            <TextField
              control={form.control}
              name={`people.${index}.fullNameAr`}
              label="الاسم الكامل"
              autoComplete="off"
              maxLength={160}
            />
            <TextField
              control={form.control}
              name={`people.${index}.phone`}
              label="الهاتف (اختياري)"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              dir="ltr"
              className="text-end"
            />
            <TextField
              control={form.control}
              name={`people.${index}.email`}
              label="البريد (اختياري)"
              type="email"
              inputMode="email"
              autoComplete="off"
              dir="ltr"
              className="text-end"
            />
            <IconButton
              label="حذف هذا الصف"
              icon={Trash2}
              className="sm:mt-6"
              disabled={rows.fields.length === 1}
              onClick={() => rows.remove(index)}
            />
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={() => rows.append(BLANK)}>
        <Plus aria-hidden />
        شخص آخر
      </Button>
    </>
  );
}

// ── قائمة الاختيار ──────────────────────────────────────────────────────

type PickItem = {
  id: string;
  label: string;
  description: string;
  note: string | null;
  disabled: boolean;
};

/**
 * قائمة بمربعات اختيار، تُمرَّر داخل النافذة. ليست `DataTable`: الجدول لا
 * يختار صفوفًا، وما يُختار هنا أسماء لا سجلات تُفتح.
 */
function PickList({
  caption,
  items,
  selected,
  loading,
  error,
  empty,
  onToggle,
}: {
  caption: string;
  items: readonly PickItem[];
  selected: readonly string[];
  loading: boolean;
  error: boolean;
  empty: string;
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const id = useId();
  const open = items.filter((item) => !item.disabled);
  const picked = open.filter((item) => selected.includes(item.id));
  const all = open.length > 0 && picked.length === open.length;

  if (loading) {
    return (
      <div className="space-y-2 rounded-md border border-border p-3" aria-busy aria-label="جارٍ التحميل">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (error) return <Alert>تعذّر تحميل القائمة. حاول مجددًا.</Alert>;

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {open.length > 1 ? (
        <label
          htmlFor={`${id}-all`}
          className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium"
        >
          <Checkbox
            id={`${id}-all`}
            checked={all}
            onCheckedChange={(next) =>
              onToggle(
                open.map((item) => item.id),
                next === true,
              )
            }
          />
          اختر الكل
          <span className="numeric text-xs font-normal text-muted-foreground">
            {picked.length}/{open.length}
          </span>
        </label>
      ) : null}

      <ul aria-label={caption} className="max-h-72 divide-y divide-border overflow-y-auto">
        {items.map((item) => {
          const checked = selected.includes(item.id);

          return (
            <li key={item.id}>
              <label
                htmlFor={`${id}-${item.id}`}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 text-sm transition-colors",
                  item.disabled
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-accent/50",
                  checked && "bg-primary/5",
                )}
              >
                <Checkbox
                  id={`${id}-${item.id}`}
                  checked={checked}
                  disabled={item.disabled}
                  onCheckedChange={(next) => onToggle([item.id], next === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block font-medium">{item.label}</span>
                  {item.description ? (
                    // `bdi` يعزل اتجاه الرقم والبريد دون أن يقلب محاذاة السطر.
                    <span className="block text-xs text-muted-foreground">
                      <bdi>{item.description}</bdi>
                    </span>
                  ) : null}
                </span>
                {item.note ? (
                  <Badge tone={item.disabled ? "neutral" : "outline"} className="h-auto min-h-6 whitespace-normal py-0.5 text-start">
                    {item.note}
                  </Badge>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── الملخص ──────────────────────────────────────────────────────────────

const MEMBERS = {
  one: "عضو واحد",
  two: "عضوان",
  few: "أعضاء",
  many: "عضوًا",
  other: "عضو",
};

/** ما جرى فعلًا بعد الإضافة: من أُضيف، ومن كان عضوًا، وما تُخطّي ولماذا. */
function Summary({ result }: { result: FieldAddMembersResult }) {
  const { added, alreadyMembers, newParticipants, skipped } = result.summary;

  return (
    <div className="space-y-3 text-sm">
      <Alert variant={added > 0 ? "info" : "warning"}>
        {added > 0
          ? `أُضيف إلى المجموعة ${countAr(added, MEMBERS)}.`
          : "لم يُضف أحد: من اخترتهم أعضاء في المجموعة سلفًا."}
      </Alert>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div className="flex justify-between gap-3 border-b border-border py-1.5">
          <dt className="text-muted-foreground">جدد في سجل المشاركين</dt>
          <dd className="numeric font-medium">{newParticipants}</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-border py-1.5">
          <dt className="text-muted-foreground">كانوا أعضاء سلفًا</dt>
          <dd className="numeric font-medium">{alreadyMembers}</dd>
        </div>
      </dl>

      {skipped.length > 0 ? (
        <div className="space-y-1.5">
          <p className="font-medium">
            تُخطّي <span className="numeric">{skipped.length}</span> من الطلبات:
          </p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            {skipped.map((entry) => (
              <li key={entry.submissionId}>{entry.reasonAr}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
