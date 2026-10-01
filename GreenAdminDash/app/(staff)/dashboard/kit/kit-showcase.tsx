"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Ban,
  Eye,
  Link2,
  Pencil,
  Plus,
  Send,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ActionButton, ActionMenu, IconButton } from "@/components/ui/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Checklist } from "@/components/ui/checklist";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DataTable,
  cells,
  columnHelper,
  PrimaryCell,
} from "@/components/ui/data-table";
import { DescriptionList } from "@/components/ui/description-list";
import { Field, Input, Label } from "@/components/ui/field";
import { FormDialog, FormSection } from "@/components/ui/form-dialog";
import {
  CheckboxField,
  CheckboxGroupField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/form-fields";
import { OneTimeLink } from "@/components/ui/one-time-link";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Section } from "@/components/ui/section";
import { Select, type SelectOption } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatCard } from "@/components/ui/stat-card";
import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FilterChips, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { UrlTabs } from "@/components/ui/url-tabs";
import { ApiError } from "@/lib/api/client";
import { CAPABILITIES } from "@/lib/auth/capabilities";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { STATUS, type StatusKind, type StatusValue } from "@/lib/status";
import { matchesQuery } from "@/lib/text/normalize-ar";

// ── بيانات تجريبية ──────────────────────────────────────────────────────

type Row = {
  id: string;
  name: string;
  stage: StatusValue<"partnerStage">;
  kind: string;
  contact: string | null;
  sites: number;
  createdAt: string;
};

const NAMES = [
  "مؤسسة أسامة للتنمية",
  "جمعية إبراهيم الخيرية",
  "فريق آمنة التطوعي",
  "هيئة الزراعة في حمص",
  "شركة مصطفى للمقاولات",
  "مبادرة شبابٌ خضر",
  "جامعة دمشق — كلية الزراعة",
  "بلدية حلب",
  "مدرسة الأمل",
  "جمعية الرحمة",
  "فريق نبض الحياة",
  "شركة الواحة",
  "مكتب إدلب للتشجير",
  "جمعية المستقبل الأخضر",
  "مؤسسة الغد",
  "فريق سواعد",
  "شركة النخيل",
  "هيئة البيئة",
  "مبادرة ظلال",
  "جمعية الندى",
  "فريق رِفقة",
  "مؤسسة البيادر",
  "شركة الريحان",
  "بلدية اللاذقية",
];

const STAGES = Object.keys(STATUS.partnerStage) as StatusValue<"partnerStage">[];

const ROWS: Row[] = NAMES.map((name, index) => ({
  id: `row-${index + 1}`,
  name,
  stage: STAGES[index % STAGES.length],
  kind: ["شركة", "جمعية", "فريق تطوعي", "جهة حكومية"][index % 4],
  contact: index % 3 === 0 ? null : ["أسامة الحلبي", "آمنة يوسف", "إبراهيم خليل"][index % 3],
  sites: (index * 7) % 23,
  createdAt: new Date(Date.UTC(2026, 0, 1 + index * 9)).toISOString(),
}));

const PEOPLE: SelectOption[] = [
  { value: "p1", label: "أسامة الحلبي", description: "osama@example.org" },
  { value: "p2", label: "آمنة يوسف", description: "amna@example.org" },
  { value: "p3", label: "إبراهيم خليل", description: "ibrahim@example.org" },
  { value: "p4", label: "مصطفى الأحمد", description: "mustafa@example.org" },
  { value: "p5", label: "فاطمة الزهراء", description: "fatima@example.org" },
  { value: "p6", label: "ريم العلي", description: "reem@example.org" },
  { value: "p7", label: "هبة الله", description: "heba@example.org" },
  { value: "p8", label: "يحيى عيسى", description: "yahya@example.org" },
  { value: "p9", label: "سلمى موسى", description: "salma@example.org" },
  { value: "p10", label: "مرتضى حسن", description: "murtada@example.org" },
];

const OFFICES: SelectOption[] = [
  { value: "o1", label: "المكتب الرئيسي", group: "دمشق" },
  { value: "o2", label: "مكتب الشراكات", group: "دمشق", depth: 1 },
  { value: "o3", label: "مكتب الإعلام", group: "دمشق", depth: 1 },
  { value: "o4", label: "مكتب حمص", group: "المحافظات" },
  { value: "o5", label: "فريق حمص الميداني", group: "المحافظات", depth: 1 },
  { value: "o6", label: "مكتب حلب", group: "المحافظات" },
  { value: "o7", label: "مكتب اللاذقية", group: "المحافظات", disabled: true },
];

const PRIORITY: SelectOption[] = [
  { value: "HIGH", label: "عالية" },
  { value: "MEDIUM", label: "متوسطة" },
  { value: "LOW", label: "منخفضة" },
];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** بحث خادم مصطنع بتأخير، ليظهر سلوك التحميل والتسمية المحفوظة. */
async function searchPeople(query: string, signal: AbortSignal) {
  await sleep(500);
  if (signal.aborted) return [];
  return PEOPLE.filter((person) => matchesQuery(query, person.label, person.description));
}

// ── الصفحة ──────────────────────────────────────────────────────────────

export function KitShowcase() {
  const confirm = useConfirm();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<"sm" | "md" | "lg" | "invite" | null>(null);

  return (
    <div className="space-y-10">
      <PageHeader
        breadcrumbs={[{ label: "الرئيسية", href: "/dashboard" }, { label: "مكتبة المكوّنات" }]}
        title="مكتبة المكوّنات"
        description="كل مكوّن بكل حالاته. صفحة للتطوير وحده، تعيد 404 في الإنتاج."
        badges={
          <>
            <StatusBadge kind="partnerStage" value="ACTIVE" />
            <Badge tone="danger">معلّقة</Badge>
          </>
        }
        primaryAction={{ key: "add", label: "إضافة شريك", icon: Plus, onSelect: () => setDialog("md") }}
        secondaryActions={[
          { key: "invite", label: "دعوة عضو", icon: Send, onSelect: () => setDialog("invite") },
          {
            key: "hidden",
            label: "فعل مخفي بالصلاحية",
            requires: [CAPABILITIES.rolesManage, CAPABILITIES.officesManage],
          },
        ]}
        menuActions={[
          { key: "settings", label: "المرجعيات", icon: Settings2, href: "/dashboard/kit?tab=b" },
          {
            key: "suspend",
            label: "تعليق مؤقت",
            icon: Ban,
            destructive: true,
            onSelect: () =>
              void confirm({
                title: "تعليق «مؤسسة أسامة للتنمية»؟",
                description: "يتوقف دخول ممثليها إلى البوابة حتى يُرفع التعليق.",
                confirmLabel: "تعليق الجهة",
                destructive: true,
                reason: { label: "سبب التعليق", placeholder: "يظهر للجهة في بوابتها" },
                onConfirm: async () => sleep(800),
                successMessage: "عُلّقت الجهة.",
              }),
          },
        ]}
      />

      <ButtonsSection />
      <BadgesSection />
      <ToolbarAndTableSection />
      <TableStatesSection />
      <SelectSection />

      <Section
        title="النوافذ"
        description="Dialog بثلاثة مقاسات، وSheet من جهة النهاية، وتأكيد بديل لـwindow.confirm."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialog("sm")}>
            نافذة sm
          </Button>
          <Button variant="outline" onClick={() => setDialog("md")}>
            نافذة md بأخطاء خادم
          </Button>
          <Button variant="outline" onClick={() => setDialog("lg")}>
            نافذة lg بأقسام
          </Button>
          <Button variant="outline" onClick={() => setDialog("invite")}>
            نافذة تعرض رابطًا بعد النجاح
          </Button>
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Sheet من جهة النهاية
          </Button>
          <ConfirmButtons />
        </div>
      </Section>

      <SmallDialog open={dialog === "sm"} onOpenChange={(open) => setDialog(open ? "sm" : null)} />
      <MediumDialog open={dialog === "md"} onOpenChange={(open) => setDialog(open ? "md" : null)} />
      <LargeDialog open={dialog === "lg"} onOpenChange={(open) => setDialog(open ? "lg" : null)} />
      <InviteDialog
        open={dialog === "invite"}
        onOpenChange={(open) => setDialog(open ? "invite" : null)}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>طلب «أسامة الحلبي»</SheetTitle>
            <SheetDescription>أُرسل في ٢١ أيلول ٢٠٢٦</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <DescriptionList
              items={[
                { label: "البريد", value: <span dir="ltr">osama@example.org</span> },
                { label: "الهاتف", value: <span className="numeric">+963 944 000 000</span> },
                { label: "المحافظة", value: "حمص" },
                { label: "الحالة", value: <StatusBadge kind="submissionStatus" value="NEW" /> },
                { label: "لماذا تريد الانضمام؟", value: "أحب الأشجار وأريد المشاركة في حملات التشجير.", wide: true },
              ]}
            />
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => toast.success("نُقل الطلب إلى «قيد المراجعة».")}>
              قيد المراجعة
            </Button>
            <Button onClick={() => toast.success("قُبل الطلب.")}>قبول الطلب</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Section title="التبويبات" description="مربوطة بعنوان الصفحة (?tab=)، فالرجوع يعيد التبويب نفسه.">
        <UrlTabs
          label="تبويبات تجريبية"
          tabs={[
            { value: "a", label: "جهات الاتصال", count: 3, content: <p className="text-sm">محتوى التبويب الأول.</p> },
            { value: "b", label: "أنواع الشراكة", count: 2, content: <p className="text-sm">محتوى التبويب الثاني.</p> },
            { value: "c", label: "الميثاق", content: <p className="text-sm">محتوى التبويب الثالث.</p> },
            { value: "d", label: "سجل المتابعة", content: <p className="text-sm">محتوى التبويب الرابع.</p> },
          ]}
        />
      </Section>

      <Section title="ملخص «مفتاح: قيمة»">
        <DescriptionList
          items={[
            { label: "الاسم القانوني", value: "مؤسسة أسامة للتنمية" },
            { label: "نوع الجهة", value: "جمعية أو منظمة أهلية" },
            { label: "أولوية التواصل", value: <Badge tone="danger">عالية</Badge> },
            { label: "آخر تواصل", value: "منذ 12 يومًا" },
            { label: "مسؤول العلاقة", value: null },
            { label: "الموقع الإلكتروني", value: <span dir="ltr">example.org</span> },
            { label: "معتمدة منذ", value: "3 آب 2026" },
            { label: "الإظهار", value: "الاسم · الشعار" },
            { label: "نبذة", value: "جمعية تعمل في التشجير الحضري منذ 2019.", wide: true },
          ]}
        />
      </Section>

      <Section title="بطاقات الأرقام" description="كلها روابط إلى القائمة المرشَّحة، وهيكل لا صفر أثناء التحميل.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="مفتوحة" value={12} href="/dashboard/kit?stat=open" />
          <StatCard label="متأخرة" value={3} tone="danger" href="/dashboard/kit?stat=overdue" />
          <StatCard label="متعثّرة" value={0} tone="warning" href="/dashboard/kit?stat=blocked" />
          <StatCard label="بانتظار الاعتماد" value={undefined} loading href="/dashboard/kit" />
        </div>
      </Section>

      <Section title="قائمة التفعيل">
        <div className="rounded-xl border border-border bg-card p-5">
          <Checklist
            items={[
              { key: "a", label: "نوع شراكة معتمد واحد على الأقل", done: true },
              { key: "b", label: "جهة اتصال رئيسية", done: true },
              { key: "c", label: "إقرار بالإصدار الساري من الميثاق", done: false, hint: "الإصدار 2.0 منشور منذ 1 أيلول." },
            ]}
          />
        </div>
      </Section>

      <Section title="رابط يُعرض مرة واحدة">
        <OneTimeLink url="https://gc-admin.evavolunteer.com/accept-invite/abc123def456ghi789jkl012mno345pqr678" />
      </Section>

      <Section title="حالات الفراغ والخطأ والتحميل">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={Users}
              title="لا شركاء بعد"
              description="سجّل أول جهة لتبدأ متابعتها من هنا."
              action={{ key: "add", label: "تسجيل جهة", icon: Plus, onSelect: () => setDialog("md") }}
            />
          </div>
          <div className="rounded-xl border border-border bg-card">
            <ErrorState
              title="تعذّر تحميل سجل الشركاء."
              error={new ApiError("انتهت مهلة الاتصال بالخادم.", 504, "TIMEOUT")}
              onRetry={() => toast("أُعيدت المحاولة.")}
            />
          </div>
          <div className="rounded-xl border border-border bg-card">
            <TableSkeleton rows={4} columns={4} />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <DetailSkeleton />
          </div>
        </div>
      </Section>

      <PrimitivesSection />
    </div>
  );
}

// ── الأزرار والشارات ────────────────────────────────────────────────────

function ButtonsSection() {
  const [loading, setLoading] = useState(false);

  return (
    <Section title="الأزرار" description="الأساسي واحد على الأكثر، والثانوية outline، وما ندر في «⋯».">
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button>أساسي</Button>
          <Button variant="outline">ثانوي</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="destructive">هدّام</Button>
          <Button variant="link">رابط</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg">كبير</Button>
          <Button>عادي</Button>
          <Button size="sm">صغير</Button>
          <Button size="xs">أصغر</Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1500);
            }}
          >
            حفظ (بحالة تحميل)
          </Button>
          <Button disabled>معطّل</Button>
          <ActionButton
            action={{
              key: "publish",
              label: "نشر المسوّدة",
              disabled: true,
              disabledReason: "أضف سؤالًا واحدًا على الأقل قبل النشر.",
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="تعديل" icon={Pencil} />
          <IconButton label="نسخ الرابط" icon={Link2} variant="outline" />
          <IconButton label="حذف" icon={Trash2} className="text-destructive" />
          <ActionMenu
            actions={[
              { key: "view", label: "عرض الملف", icon: Eye, href: "/dashboard/kit" },
              { key: "edit", label: "تعديل التصنيف", icon: Pencil, onSelect: () => toast("تعديل") },
              { key: "stage", label: "تغيير المرحلة", onSelect: () => toast("مرحلة") },
              { key: "del", label: "حذف", icon: Trash2, destructive: true, onSelect: () => toast.error("حذف") },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}

function BadgesSection() {
  return (
    <Section title="الشارات" description="كل تعداد بتسميته ولونه من lib/status.ts.">
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap gap-2">
          {(["neutral", "accent", "primary", "success", "warning", "danger", "info", "outline"] as const).map(
            (tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ),
          )}
        </div>
        <dl className="space-y-2">
          {(Object.keys(STATUS) as StatusKind[]).map((kind) => (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <dt className="w-40 shrink-0 text-xs text-muted-foreground" dir="ltr">
                {kind}
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {Object.keys(STATUS[kind]).map((value) => (
                  <StatusBadge key={value} kind={kind} value={value as StatusValue<typeof kind>} />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}

// ── شريط الأدوات والجدول ────────────────────────────────────────────────

const col = columnHelper<Row>();

function ToolbarAndTableSection() {
  const confirm = useConfirm();
  const [filters, setFilters, resetFilters] = useUrlState({ q: "", stage: "", priority: "" });
  const [removed, setRemoved] = useState<string[]>([]);

  const rows = useMemo(
    () =>
      ROWS.filter(
        (row) =>
          !removed.includes(row.id) &&
          (!filters.stage || row.stage === filters.stage) &&
          matchesQuery(filters.q, row.name, row.contact),
      ),
    [filters.q, filters.stage, removed],
  );

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("name", {
          header: "الجهة",
          cell: (info) => (
            <PrimaryCell
              label={info.getValue()}
              href={`/dashboard/kit?row=${info.row.original.id}`}
              description={info.row.original.kind}
            />
          ),
        }),
        col.accessor("stage", {
          header: "المرحلة",
          cell: (info) => <StatusBadge kind="partnerStage" value={info.getValue()} />,
          meta: { className: "whitespace-nowrap" },
        }),
        col.accessor("contact", { header: "جهة الاتصال", cell: (info) => cells.text(info.getValue()) }),
        col.accessor("sites", {
          header: "المواقع",
          cell: (info) => cells.number(info.getValue()),
          meta: { numeric: true },
        }),
        col.accessor("createdAt", {
          header: "أُضيفت",
          cell: (info) => cells.date(info.getValue()),
        }),
      ]),
    [],
  );

  const hasFilters = Boolean(filters.q || filters.stage || filters.priority);

  return (
    <Section
      title="شريط الأدوات والجدول"
      description="البحث فوري بتأخير 300ms ويطبّع العربية، والمرشحات في عنوان الصفحة. جرّب «اسامه» أو «ابراهيم»."
      actions={[{ key: "add", label: "إضافة شريك", icon: Plus, onSelect: () => toast("إضافة") }]}
    >
      <div className="space-y-3">
        <Toolbar
          search={
            <SearchInput
              value={filters.q}
              onChange={(q) => setFilters({ q })}
              placeholder="ابحث بالاسم أو جهة الاتصال…"
            />
          }
          hasActiveFilters={hasFilters}
          onReset={resetFilters}
        >
          <FilterChips
            label="المرحلة"
            value={filters.stage}
            onChange={(stage) => setFilters({ stage })}
            options={[
              { value: "", label: "الكل" },
              { value: "NEW", label: "جديدة" },
              { value: "NEGOTIATION", label: "تفاوض" },
              { value: "ACTIVE", label: "نشطة" },
            ]}
          />
          <Select
            size="sm"
            label="الأولوية"
            className="w-44"
            placeholder="الكل"
            clearable
            options={PRIORITY}
            value={filters.priority || null}
            onChange={(priority) => setFilters({ priority })}
          />
        </Toolbar>

        <DataTable
          caption="جهات تجريبية"
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          urlState
          filtered={hasFilters}
          onClearFilters={resetFilters}
          empty={{ title: "لا جهات بعد", description: "سجّل أول جهة لتبدأ متابعتها." }}
          rowHref={(row) => `/dashboard/kit?row=${row.id}`}
          rowActions={(row) => [
            { key: "view", label: "عرض الملف", icon: Eye, quick: true, href: `/dashboard/kit?row=${row.id}` },
            { key: "edit", label: "تعديل التصنيف", icon: Pencil, onSelect: () => toast(`تعديل ${row.name}`) },
            {
              key: "hidden",
              label: "مخفي بالصلاحية",
              requires: [CAPABILITIES.rolesManage, CAPABILITIES.officesManage],
            },
            {
              key: "delete",
              label: "حذف",
              icon: Trash2,
              destructive: true,
              onSelect: () =>
                void confirm({
                  title: `حذف «${row.name}»؟`,
                  description: "يُمحى السجل وما يتبعه ولا رجعة في ذلك.",
                  confirmLabel: "حذف الجهة",
                  destructive: true,
                  onConfirm: async () => {
                    await sleep(600);
                    setRemoved((current) => [...current, row.id]);
                  },
                  successMessage: "حُذفت الجهة.",
                }),
            },
          ]}
        />
      </div>
    </Section>
  );
}

function TableStatesSection() {
  const [state, setState] = useState("loading");
  const [loaded, setLoaded] = useState(8);
  const [loadingMore, setLoadingMore] = useState(false);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("name", { header: "الجهة", cell: (info) => <PrimaryCell label={info.getValue()} onClick={() => toast("تفتح Sheet")} /> }),
        col.accessor("createdAt", { header: "التاريخ", cell: (info) => cells.dateTime(info.getValue()) }),
      ]),
    [],
  );

  return (
    <Section title="حالات الجدول" description="التحميل والفراغ و«لا نتائج» والخطأ مدمجة، ووضع «تحميل المزيد» للقوائم ذات المؤشر.">
      <div className="space-y-3">
        <FilterChips
          label="حالة الجدول"
          value={state}
          onChange={setState}
          options={[
            { value: "loading", label: "تحميل" },
            { value: "empty", label: "فارغ" },
            { value: "filtered", label: "لا نتائج" },
            { value: "error", label: "خطأ" },
            { value: "cursor", label: "تحميل المزيد" },
          ]}
        />
        <DataTable
          caption="حالات الجدول"
          columns={columns}
          data={state === "cursor" ? ROWS.slice(0, loaded) : state === "loading" ? undefined : []}
          isLoading={state === "loading"}
          error={state === "error" ? new ApiError("الخادم لا يستجيب.", 503, "UNAVAILABLE") : undefined}
          onRetry={() => setState("cursor")}
          filtered={state === "filtered"}
          onClearFilters={() => setState("cursor")}
          empty={{
            title: "لا سجلات بعد",
            description: "كل تغيير حالة واعتماد يُسجَّل هنا تلقائيًا.",
            action: { key: "x", label: "إضافة سجل", icon: Plus, onSelect: () => toast("إضافة") },
          }}
          getRowId={(row) => row.id}
          pagination={
            state === "cursor"
              ? {
                  mode: "cursor",
                  hasMore: loaded < ROWS.length,
                  isLoadingMore: loadingMore,
                  onLoadMore: () => {
                    setLoadingMore(true);
                    window.setTimeout(() => {
                      setLoaded((count) => count + 8);
                      setLoadingMore(false);
                    }, 700);
                  },
                }
              : { mode: "client" }
          }
        />
      </div>
    </Section>
  );
}

// ── قوائم الاختيار ──────────────────────────────────────────────────────

function SelectSection() {
  const [single, setSingle] = useState<string | null>("MEDIUM");
  const [person, setPerson] = useState<string | null>("p2");
  const [many, setMany] = useState<string[]>(["o2", "o4"]);
  const [remote, setRemote] = useState<string | null>(null);

  return (
    <Section
      title="قائمة الاختيار"
      description="البحث يظهر وحده فوق سبعة خيارات أو مع بحث الخادم، ويطبّع العربية: «اسامه» تجد «أسامة»."
    >
      <div className="grid gap-5 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
        <Field id="kit-priority" label="قصيرة بلا بحث (3 خيارات)">
          {(aria) => (
            <Select {...aria} options={PRIORITY} value={single} onChange={setSingle} />
          )}
        </Field>
        <Field id="kit-person" label="طويلة بالبحث ووصف ثانوي" hint="جرّب: اسامه، ابراهيم، امنه، فاطمه">
          {(aria) => (
            <Select {...aria} options={PEOPLE} value={person} onChange={setPerson} clearable />
          )}
        </Field>
        <Field id="kit-offices" label="متعددة بمجموعات وتدرّج وخيار معطّل">
          {(aria) => (
            <Select {...aria} multiple options={OFFICES} value={many} onChange={setMany} searchable />
          )}
        </Field>
        <Field id="kit-remote" label="بحث على الخادم (تأخير مصطنع)" hint="التسمية تبقى بعد تغيّر النتائج.">
          {(aria) => (
            <Select
              {...aria}
              source={{ queryKey: ["kit-people"], load: searchPeople }}
              value={remote}
              onChange={setRemote}
              clearable
              placeholder="ابحث عن عضو…"
            />
          )}
        </Field>
        <Field id="kit-error" label="بخطأ تحقق" error="اختر المكتب.">
          {(aria) => <Select {...aria} options={OFFICES} value={null} onChange={() => undefined} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="kit-disabled" label="معطّلة">
            {(aria) => <Select {...aria} options={PRIORITY} value="LOW" onChange={() => undefined} disabled />}
          </Field>
          <Field id="kit-loading" label="تحمّل خياراتها">
            {(aria) => <Select {...aria} options={[]} value={null} onChange={() => undefined} loading />}
          </Field>
        </div>
      </div>
    </Section>
  );
}

// ── النوافذ ─────────────────────────────────────────────────────────────

function ConfirmButtons() {
  const confirm = useConfirm();
  const [attempts, setAttempts] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        onClick={async () => {
          const ok = await confirm({
            title: "نشر الإصدار 2.1 من الميثاق؟",
            description: "النشر لا رجعة فيه: يصير هذا الإصدار مرجع الإقرارات الجديدة.",
            confirmLabel: "نشر الإصدار",
          });
          toast(ok ? "تأكيد" : "تراجع");
        }}
      >
        تأكيد عادي
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          void confirm({
            title: "إلغاء الدعوة المرسلة إلى amna@example.org؟",
            description: "يتوقف الرابط عن العمل فورًا. يمكن إرسال دعوة جديدة لاحقًا.",
            confirmLabel: "إلغاء الدعوة",
            destructive: true,
            onConfirm: async () => {
              await sleep(700);
              setAttempts((count) => count + 1);
              if (attempts % 2 === 0) {
                throw new ApiError("الدعوة غير موجودة أو ليست معلّقة.", 404, "NOT_FOUND");
              }
            },
            successMessage: "أُلغيت الدعوة.",
          })
        }
      >
        تأكيد هدّام يفشل مرة
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          void confirm({
            title: "تعثّر مهمة «زراعة 20 شجرة في حي الوعر»؟",
            description: "تنتقل المهمة إلى «متعثّرة» ويظهر السبب لمن يتابعها.",
            confirmLabel: "تسجيل التعثّر",
            reason: { label: "ما سبب تعثّر المهمة؟" },
            onConfirm: async () => sleep(600),
            successMessage: "سُجّل التعثّر.",
          })
        }
      >
        تأكيد بسبب
      </Button>
    </>
  );
}

const smallSchema = z.object({ nameAr: z.string().trim().min(2, "الاسم مطلوب.") });

function SmallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useForm({ resolver: zodResolver(smallSchema), defaultValues: { nameAr: "" } });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="إضافة نوع علاقة"
      form={form}
      submitLabel="إضافة النوع"
      successMessage="أُضيف النوع."
      onSubmit={async () => sleep(700)}
    >
      <TextField control={form.control} name="nameAr" label="الاسم بالعربية" />
    </FormDialog>
  );
}

const mediumSchema = z.object({
  slug: z.string().trim().min(2, "المعرّف مطلوب."),
  email: z.email("صيغة البريد غير صحيحة."),
  priority: z.string().min(1, "اختر الأولوية."),
  notes: z.string().max(200).optional(),
});

/** يرسل الخادم المصطنع خطأ تحقق مرتبطًا بحقلين، ثم ينجح في المرة الثانية. */
function MediumDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tries, setTries] = useState(0);
  const form = useForm({
    resolver: zodResolver(mediumSchema),
    defaultValues: { slug: "", email: "", priority: "", notes: "" },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="تسجيل جهة"
      description="المحاولة الأولى تعيد أخطاء تحقق من الخادم تحت حقولها."
      form={form}
      submitLabel="تسجيل الجهة"
      successMessage="سُجّلت الجهة."
      onSubmit={async () => {
        await sleep(800);
        setTries((count) => count + 1);

        if (tries === 0) {
          throw new ApiError("البيانات المرسلة غير صالحة.", 422, "VALIDATION", {
            type: "about:blank",
            title: "VALIDATION",
            status: 422,
            detail: "البيانات المرسلة غير صالحة.",
            details: [
              { in: "body", path: "slug", message: "المعرّف مستعمل لجهة أخرى." },
              { in: "body", path: "email", message: "البريد مسجّل لحساب آخر." },
              { in: "body", path: "legalCode", message: "رمز الترخيص غير صالح (حقل ليس في النموذج)." },
            ],
          } as never);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="slug" label="المعرّف" dir="ltr" className="text-start" />
        <TextField control={form.control} name="email" label="البريد" type="email" dir="ltr" className="text-start" />
      </div>
      <SelectField control={form.control} name="priority" label="أولوية التواصل" options={PRIORITY} />
      <TextareaField control={form.control} name="notes" label="ملاحظات" rows={3} />
    </FormDialog>
  );
}

const largeSchema = z.object({
  legalNameAr: z.string().trim().min(2, "الاسم القانوني مطلوب."),
  displayNameAr: z.string().optional(),
  officeId: z.string().min(1, "اختر المكتب."),
  supportForms: z.array(z.string()),
  channelIds: z.array(z.string()),
  primary: z.boolean(),
  summaryAr: z.string().optional(),
});

function LargeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useForm({
    resolver: zodResolver(largeSchema),
    defaultValues: {
      legalNameAr: "",
      displayNameAr: "",
      officeId: "",
      supportForms: [],
      channelIds: [],
      primary: true,
      summaryAr: "",
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="تسجيل جهة محتملة"
      description="تبدأ الجهة في مرحلة «جديدة». عدّل حقلًا ثم أغلق النافذة لترى سؤال تجاهل التغييرات."
      form={form}
      submitLabel="تسجيل الجهة"
      successMessage="سُجّلت الجهة."
      onSubmit={async () => sleep(900)}
    >
      <FormSection title="بيانات الجهة">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="legalNameAr" label="الاسم القانوني" />
          <TextField control={form.control} name="displayNameAr" label="اسم العرض" hint="اتركه فارغًا ليطابق الاسم القانوني." />
        </div>
        <SelectField control={form.control} name="officeId" label="المكتب" options={OFFICES} />
        <CheckboxGroupField
          control={form.control}
          name="supportForms"
          label="أشكال المشاركة والدعم"
          hint="يمكن اختيار أكثر من شكل."
          options={[
            { value: "a", label: "الدعم المعنوي والإعلامي" },
            { value: "b", label: "المشاركة المجتمعية والتطوعية" },
            { value: "c", label: "الرعاية أو الدعم اللوجستي" },
            { value: "d", label: "توفير مساحات أو موارد" },
          ]}
        />
      </FormSection>
      <FormSection title="التصنيف" description="كلها اختيارية وتُضبط بعد أول تواصل.">
        <SelectField control={form.control} name="channelIds" label="أشكال العمل الإعلامي" multiple options={PEOPLE} />
        <CheckboxField control={form.control} name="primary" label="جهة الاتصال الرئيسية" hint="تحلّ محل الرئيسية الحالية." />
      </FormSection>
      <FormSection title="ملاحظات">
        <TextareaField control={form.control} name="summaryAr" label="نبذة عن الجهة" rows={4} />
      </FormSection>
    </FormDialog>
  );
}

const inviteSchema = z.object({ email: z.email("صيغة البريد غير صحيحة.") });

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useForm({ resolver: zodResolver(inviteSchema), defaultValues: { email: "" } });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="دعوة عضو"
      form={form}
      submitLabel="إرسال الدعوة"
      successMessage="أُنشئت الدعوة."
      onSubmit={async (values) => {
        await sleep(700);
        return `https://gc-admin.evavolunteer.com/accept-invite/${btoa(values.email).slice(0, 24)}`;
      }}
      renderSuccess={(url) => <OneTimeLink url={url} />}
    >
      <TextField control={form.control} name="email" label="البريد الإلكتروني" type="email" dir="ltr" className="text-start" />
    </FormDialog>
  );
}

// ── عناصر أولية ─────────────────────────────────────────────────────────

function PrimitivesSection() {
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(false);
  const [url, setUrl] = useState("https://");

  return (
    <Section title="عناصر أولية" description="Tooltip وPopover وTextarea وCheckbox وSwitch والإشعارات.">
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => toast.success("حُفظت المقدّمة.")}>
            إشعار نجاح
          </Button>
          <Button variant="outline" onClick={() => toast.error("تعذّر حفظ المقدّمة. حاول مجددًا.")}>
            إشعار فشل
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Link2 aria-hidden />
                إضافة رابط
              </Button>
            </PopoverTrigger>
            <PopoverContent className="space-y-2">
              <Label htmlFor="kit-url">عنوان الرابط</Label>
              <Input id="kit-url" dir="ltr" className="text-start" value={url} onChange={(event) => setUrl(event.target.value)} />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast.success(`أُضيف الرابط ${url}`)}>
                  إضافة الرابط
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Checkbox id="kit-check" checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
            <Label htmlFor="kit-check" className="font-normal">
              إجابة إلزامية
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="kit-switch" checked={on} onCheckedChange={setOn} />
            <Label htmlFor="kit-switch" className="font-normal">
              الاستقبال {on ? "مفتوح" : "مغلق"}
            </Label>
          </div>
        </div>

        <div className="max-w-xl space-y-1.5">
          <Label htmlFor="kit-textarea">تفاصيل</Label>
          <Textarea id="kit-textarea" rows={3} placeholder="نص طويل…" />
        </div>

        <Alert variant="info">تنبيه معلوماتي داخل صفحة أو نافذة.</Alert>
        <Alert variant="warning">تحذير قبل فعل: بيانات ناقصة لا تمنع المتابعة.</Alert>
        <Alert>تنبيه خطأ داخل نافذة.</Alert>
      </div>
    </Section>
  );
}
