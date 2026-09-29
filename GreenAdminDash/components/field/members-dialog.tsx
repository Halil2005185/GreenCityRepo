"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  Link2Off,
  RefreshCcw,
  UserMinus,
  UserPlus,
  UserRoundCheck,
  UserRoundCog,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AddMembersDialog, membersKey } from "@/components/field/add-members-dialog";
import { fieldKey } from "@/components/field/group-dialog";
import { LinksDialog } from "@/components/field/links-dialog";
import { ActionButton } from "@/components/ui/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyCell, PrimaryCell, columnHelper } from "@/components/ui/data-table";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { CheckboxField, SelectField, TextField } from "@/components/ui/form-fields";
import { SearchInput } from "@/components/ui/toolbar";
import {
  MEMBER_ROLE_LABELS,
  RSVP_LABELS,
  createLinks,
  listGroupMembers,
  removeGroupMember,
  revokeLinks,
  updateGroupMember,
  type FieldGroup,
  type FieldGroupMember,
  type FieldGroupMembers,
  type FieldIssuedLinks,
} from "@/lib/api/field";
import { useApiMutation } from "@/lib/api/use-api-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { matchesQuery } from "@/lib/text/normalize-ar";
import { countAr } from "@/lib/text/plural-ar";
import { formatDate } from "@/lib/utils";

const MANAGE = [CAPABILITIES.fieldManage] as const;

const DAYS = { one: "يوم واحد", two: "يومان", few: "أيام", many: "يومًا", other: "يوم" };

const MEMBERS = {
  one: "عضو واحد",
  two: "عضوان",
  few: "أعضاء",
  many: "عضوًا",
  other: "عضو",
};

const RSVP_TONES = {
  UNKNOWN: "neutral",
  COMING: "success",
  NOT_COMING: "warning",
} as const;

const memberCol = columnHelper<FieldGroupMember>();

/**
 * أعضاء المجموعة: من يراهم قائدها في «الحضور» بالتطبيق الميداني، ومن
 * يُرسَل إليهم رابط بطاقتهم.
 *
 * نافذة لا صفحة: المنسّق يوزّع المتطوعين على مجموعات المبادرة واحدة بعد
 * أخرى، ويعود إلى قائمتها بين كل اثنتين.
 */
export function MembersDialog({
  initiativeId,
  group,
  readOnly,
  open,
  onOpenChange,
}: {
  initiativeId: string;
  group: FieldGroup | null;
  /** المبادرة مغلقة: القائمة سجلّ يُقرأ. الروابط تبقى — بطاقة ما بعد اليوم. */
  readOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {group ? (
          <Members
            // مجموعة أخرى جلسة أخرى: بحثها ونوافذها تبدأ من جديد.
            key={group.id}
            initiativeId={initiativeId}
            group={group}
            readOnly={readOnly}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Members({
  initiativeId,
  group,
  readOnly,
}: {
  initiativeId: string;
  group: FieldGroup;
  readOnly: boolean;
}) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ links: FieldIssuedLinks | null; open: boolean }>({
    links: null,
    open: false,
  });
  const key = membersKey(initiativeId, group.id);

  const members = useQuery({
    queryKey: key,
    queryFn: () => listGroupMembers(initiativeId, group.id),
  });

  /** كل كتابة تعيد القائمة كاملة؛ وعدّاد المجموعة في الجدول خلفها يتبعها. */
  const apply = (next: FieldGroupMembers) => {
    queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: fieldKey(initiativeId) });
  };

  /** الروابط لا تعيد القائمة: تُقرأ من جديد، ومعها عدّادات المجموعات. */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: fieldKey(initiativeId) });
  };

  const show = (links: FieldIssuedLinks) => {
    refresh();
    setIssued({ links, open: true });
  };

  const changeRole = useApiMutation({
    mutationFn: (member: FieldGroupMember) =>
      updateGroupMember(initiativeId, group.id, member.id, {
        role: member.role === "ASSISTANT" ? "MEMBER" : "ASSISTANT",
      }),
    successMessage: (_data, member) =>
      member.role === "ASSISTANT"
        ? `عاد ${member.fullNameAr} عضوًا.`
        : `صار ${member.fullNameAr} مساعدًا للقائد.`,
    onSuccess: apply,
  });

  const all = useMemo(() => members.data?.members ?? [], [members.data]);

  const visible = useMemo(
    () =>
      all.filter((member) =>
        matchesQuery(search, member.fullNameAr, member.phone, member.email),
      ),
    [all, search],
  );

  const columns = useMemo(
    () =>
      memberCol.columns([
        memberCol.accessor("fullNameAr", {
          header: "الاسم",
          cell: (info) => {
            const { phone, email, fromForm, role } = info.row.original;

            return (
              <PrimaryCell
                label={info.getValue()}
                description={
                  phone || email ? <bdi>{[phone, email].filter(Boolean).join(" · ")}</bdi> : null
                }
                badge={
                  <>
                    {role === "ASSISTANT" ? (
                      <Badge tone="primary">{MEMBER_ROLE_LABELS.ASSISTANT}</Badge>
                    ) : null}
                    {fromForm ? <Badge tone="outline">من استمارة</Badge> : null}
                  </>
                }
              />
            );
          },
        }),
        memberCol.accessor("rsvp", {
          header: "تأكيد الحضور",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => (
            <Badge tone={RSVP_TONES[info.getValue()]}>{RSVP_LABELS[info.getValue()]}</Badge>
          ),
        }),
        memberCol.accessor((member) => member.link?.status ?? "NONE", {
          id: "link",
          header: "الرابط",
          meta: { className: "whitespace-nowrap" },
          cell: (info) => {
            const { link } = info.row.original;

            if (!link) return <EmptyCell />;

            if (link.status === "EXPIRED") return <Badge tone="warning">انتهى</Badge>;

            return (
              <div className="space-y-0.5">
                <Badge tone={link.lastUsedAt ? "success" : "neutral"}>
                  {link.lastUsedAt ? "فُتح" : "لم يُفتح بعد"}
                </Badge>
                <p className="text-xs text-muted-foreground">حتى {formatDate(link.expiresAt)}</p>
              </div>
            );
          },
        }),
        memberCol.accessor("attendedDays", {
          header: "حضر",
          meta: { className: "whitespace-nowrap" },
          cell: (info) =>
            info.getValue() > 0 ? countAr(info.getValue(), DAYS) : <EmptyCell />,
        }),
      ]),
    [],
  );

  const add = {
    key: "add-members",
    label: "إضافة أعضاء",
    icon: UserPlus,
    requires: MANAGE,
    hidden: readOnly,
    onSelect: () => setAdding(true),
  };

  const issue = {
    key: "issue-links",
    label: "توليد الروابط",
    icon: Link2,
    requires: MANAGE,
    disabled: all.length === 0,
    disabledReason: "أضف أعضاء أولًا.",
    onSelect: () => setIssuing(true),
  };

  const total = members.data ? all.length : group.memberCount;
  const manage = can(CAPABILITIES.fieldManage);

  return (
    <>
      <DialogHeader>
        <DialogTitle>أعضاء «{group.nameAr}»</DialogTitle>
        <DialogDescription>
          {[
            group.siteNameAr,
            group.leadNameAr ? `القائد: ${group.leadNameAr}` : "بلا قائد",
            total > 0 ? countAr(total, MEMBERS) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث بالاسم أو الهاتف"
            label="ابحث في أعضاء المجموعة"
            className="min-w-0 flex-1 sm:max-w-72"
          />
          {manage ? (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton action={issue} size="sm" />
              {readOnly ? null : <ActionButton action={add} variant="default" size="sm" />}
            </div>
          ) : null}
        </div>

        <DataTable
          caption={`أعضاء ${group.nameAr}`}
          columns={columns}
          data={members.data ? visible : undefined}
          getRowId={(member) => member.id}
          isLoading={members.isPending}
          error={members.error}
          onRetry={() => void members.refetch()}
          pagination={{ mode: "client", pageSize: 10 }}
          filtered={search !== ""}
          onClearFilters={() => setSearch("")}
          empty={{
            title: "لا أعضاء في المجموعة بعد",
            description:
              "أضف المقبولين في استمارة التطوع، أو من شارك سابقًا، أو اكتب الأسماء. ومن يحضر بلا تسجيل يضيفه القائد من التطبيق.",
            action: add,
          }}
          rowActions={(member) => [
            {
              key: "link",
              label: member.link ? "رابط جديد" : "توليد رابطه",
              icon: member.link ? RefreshCcw : Link2,
              requires: MANAGE,
              onSelect: () =>
                void confirm({
                  title: member.link
                    ? `رابط جديد لـ${member.fullNameAr}؟`
                    : `توليد رابط ${member.fullNameAr}؟`,
                  description: member.link
                    ? "رابطه الحالي يُبطَل فورًا، وبطاقته تُغلق على كل هاتف فتحها حتى يفتح الجديد."
                    : "يظهر الرابط مرة واحدة بعد توليده، لتنسخه أو ترسله.",
                  confirmLabel: member.link ? "إبطال القديم وتوليد جديد" : "توليد الرابط",
                  onConfirm: async () =>
                    show(
                      await createLinks(initiativeId, {
                        participantIds: [member.participantId],
                      }),
                    ),
                }),
            },
            {
              key: "revoke",
              label: "إبطال الرابط",
              icon: Link2Off,
              requires: MANAGE,
              hidden: !member.link,
              onSelect: () =>
                void confirm({
                  title: `إبطال رابط ${member.fullNameAr}؟`,
                  description:
                    "بطاقته تُغلق فورًا على كل هاتف فتحها. يبقى عضوًا في المجموعة، وتولّد له رابطًا جديدًا متى شئت.",
                  confirmLabel: "إبطال الرابط",
                  destructive: true,
                  successMessage: "أُبطل الرابط.",
                  onConfirm: async () => {
                    await revokeLinks(initiativeId, [member.participantId]);
                    refresh();
                  },
                }),
            },
            {
              key: "role",
              label: member.role === "ASSISTANT" ? "أعده عضوًا" : "اجعله مساعدًا للقائد",
              icon: member.role === "ASSISTANT" ? UserRoundCheck : UserRoundCog,
              requires: MANAGE,
              hidden: readOnly,
              loading: changeRole.isPendingFor((pending) => pending.id === member.id),
              onSelect: () => changeRole.mutate(member),
            },
            {
              key: "remove",
              label: "إخراج من المجموعة",
              icon: UserMinus,
              destructive: true,
              requires: MANAGE,
              hidden: readOnly,
              onSelect: () =>
                void confirm({
                  title: `إخراج ${member.fullNameAr} من «${group.nameAr}»؟`,
                  description:
                    "يخرج من قائمة المجموعة ويبقى في سجل المشاركين، وحضوره السابق فيها محفوظ.",
                  confirmLabel: "إخراج من المجموعة",
                  destructive: true,
                  successMessage: "أُخرج من المجموعة.",
                  onConfirm: async () =>
                    apply(await removeGroupMember(initiativeId, group.id, member.id)),
                }),
            },
          ]}
        />
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            إغلاق
          </Button>
        </DialogClose>
      </DialogFooter>

      <AddMembersDialog
        initiativeId={initiativeId}
        group={group}
        open={adding}
        onOpenChange={setAdding}
      />

      <IssueLinksDialog
        initiativeId={initiativeId}
        group={group}
        members={all}
        open={issuing}
        onOpenChange={setIssuing}
        onIssued={show}
      />

      <LinksDialog
        issued={issued.links}
        open={issued.open}
        onOpenChange={(next) => setIssued((current) => ({ ...current, open: next }))}
      />
    </>
  );
}

const issueSchema = z.object({
  scope: z.enum(["missing", "all"]),
  ttlDays: z
    .string()
    .trim()
    .regex(/^[0-9]{1,3}$/, "اكتب عدد الأيام بالأرقام.")
    .refine((value) => Number(value) >= 1, "يوم واحد على الأقل.")
    .refine((value) => Number(value) <= 365, "سنة على الأكثر."),
  email: z.boolean(),
});

type IssueValues = z.infer<typeof issueSchema>;

/**
 * توليد الروابط دفعةً. الافتراضي لمن لا رابط قائمًا له: توليدٌ للجميع يُبطل
 * روابط وصلت أصحابها وفتحوها.
 */
function IssueLinksDialog({
  initiativeId,
  group,
  members,
  open,
  onOpenChange,
  onIssued,
}: {
  initiativeId: string;
  group: FieldGroup;
  members: readonly FieldGroupMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (links: FieldIssuedLinks) => void;
}) {
  const form = useForm<IssueValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: { scope: "missing", ttlDays: "45", email: false },
  });

  const missing = members.filter((member) => member.link?.status !== "ACTIVE");
  const withEmail = members.filter((member) => member.email).length;

  return (
    <FormDialog<IssueValues, FieldIssuedLinks>
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`روابط «${group.nameAr}»`}
      description="رابط شخصي لكل متطوع: فيه موعده وموقعه وقائد مجموعته، ومنه يؤكّد حضوره. بلا حساب ولا كلمة مرور."
      form={form}
      values={{
        scope: missing.length > 0 ? "missing" : "all",
        ttlDays: "45",
        email: false,
      }}
      submitLabel="توليد الروابط"
      onSubmit={(values) =>
        createLinks(initiativeId, {
          ...(values.scope === "all"
            ? { groupId: group.id }
            : { participantIds: missing.map((member) => member.participantId) }),
          ttlDays: Number(values.ttlDays),
          email: values.email,
        })
      }
      onSuccess={onIssued}
      fieldForError={(error) => (error.status === 422 ? "scope" : null)}
    >
      <SelectField
        control={form.control}
        name="scope"
        label="لمن"
        options={[
          {
            value: "missing",
            label: "من لا رابط قائمًا له",
            description: `${missing.length} من ${members.length}`,
            disabled: missing.length === 0,
          },
          {
            value: "all",
            label: "كل أعضاء المجموعة",
            description: "يُبطل ما وصلهم من روابط",
          },
        ]}
      />
      <TextField
        control={form.control}
        name="ttlDays"
        label="صلاحية الرابط بالأيام"
        hint="يغطي يوم الحملة وما بعده: بالرابط نفسه يرى المتطوع ما تحقق في موقعه."
        inputMode="numeric"
        dir="ltr"
        className="text-end"
      />
      <CheckboxField
        control={form.control}
        name="email"
        label="أرسل الرابط بالبريد لمن له بريد"
        hint={
          withEmail > 0
            ? `لهم بريد: ${withEmail}. البقية تنسخ روابطهم أو ترسلها بواتساب من النافذة التالية.`
            : "لا أحد في المجموعة له بريد مسجَّل."
        }
      />
    </FormDialog>
  );
}
