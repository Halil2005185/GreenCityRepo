"use client";

import { type LucideIcon, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth/auth-context";
import type { Capability } from "@/lib/auth/capabilities";
import { rememberMenuInvoker } from "@/lib/focus";
import { cn } from "@/lib/utils";

/**
 * وصف فعل واحد يُرسم زرًا في الترويسة أو في القسم، أو عنصرًا في قائمة
 * «⋯»، أو زر أيقونة في صف جدول — بتعريف واحد، فأفعال الصف هي أفعال صفحة
 * التفاصيل نفسها وتفتح النوافذ نفسها.
 */
export type ActionDef = {
  key: string;
  /** فعل واسم: «إضافة شريك» لا «إضافة». */
  label: string;
  icon?: LucideIcon;
  /** رابط حقيقي يُفتح في تبويب جديد، أو… */
  href?: string;
  /** …فعل يفتح نافذة أو ينفّذ مباشرة. */
  onSelect?: () => void;
  /**
   * يُخفى عمّن لا يملك أيًّا منها. الإخفاء تحسين تجربة لا حماية: الخادم
   * يفحص كل طلب (`lib/auth/capabilities.ts`).
   */
  requires?: readonly Capability[];
  hidden?: boolean;
  disabled?: boolean;
  /** لماذا الفعل معطّل — يظهر تلميحًا بدل زر صامت لا يستجيب. */
  disabledReason?: string;
  /** يُفصل عن غيره في آخر القائمة وبلون التحذير، ويمرّ بتأكيد عند المستدعي. */
  destructive?: boolean;
  /** في الجدول: فعل سريع ظاهر بجانب «⋯». واحد على الأكثر لكل صف. */
  quick?: boolean;
  loading?: boolean;
};

export type MaybeAction = ActionDef | false | null | undefined;

/** يُسقط الفارغ والمخفي وما لا يملك المستخدم صلاحيته. */
export function useVisibleActions() {
  const { canAny } = useAuth();

  return (actions: readonly MaybeAction[]) =>
    actions.filter(
      (action): action is ActionDef =>
        Boolean(action) &&
        !(action as ActionDef).hidden &&
        (!(action as ActionDef).requires ||
          canAny(...((action as ActionDef).requires ?? []))),
    );
}

/** الترتيب الثابت للقائمة: ما قدّمه المستدعي أولًا، ثم الهدّام بعد فاصل. */
function splitDestructive(actions: readonly ActionDef[]) {
  return {
    regular: actions.filter((action) => !action.destructive),
    destructive: actions.filter((action) => action.destructive),
  };
}

/**
 * زر أيقونة وحدها: `aria-label` لقارئ الشاشة وتلميح بالنص نفسه لمن يرى،
 * فلا يبقى أي منهما يخمّن ماذا تفعل الأيقونة.
 */
export function IconButton({
  label,
  icon: Icon,
  iconClassName,
  variant = "ghost",
  size = "icon-sm",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "size"> & {
  label: string;
  icon: LucideIcon;
  /** للأيقونات الاتجاهية: `rtl:rotate-180`. */
  iconClassName?: string;
  size?: "icon" | "icon-sm" | "icon-xs";
}) {
  return (
    <SimpleTooltip label={label}>
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={label}
        className={className}
        {...props}
      >
        <Icon aria-hidden className={iconClassName} />
      </Button>
    </SimpleTooltip>
  );
}

export function ActionButton({
  action,
  variant = "outline",
  size = "default",
  className,
}: {
  action: ActionDef;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const Icon = action.icon;
  const content = (
    <>
      {Icon ? <Icon aria-hidden /> : null}
      {action.label}
    </>
  );

  const button =
    action.href && !action.disabled ? (
      <Link
        href={action.href}
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {content}
      </Link>
    ) : (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={action.disabled}
        loading={action.loading}
        onClick={action.onSelect}
      >
        {action.loading ? action.label : content}
      </Button>
    );

  if (action.disabled && action.disabledReason) {
    // الزر المعطّل لا يستقبل أحداث المؤشر، فالتلميح على غلاف يستقبلها.
    return (
      <SimpleTooltip label={action.disabledReason}>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {button}
        </span>
      </SimpleTooltip>
    );
  }

  return button;
}

function MenuItems({
  actions,
  onInvoke,
}: {
  actions: readonly ActionDef[];
  onInvoke: () => void;
}) {
  const { regular, destructive } = splitDestructive(actions);

  const item = (action: ActionDef) => {
    const Icon = action.icon;
    const content = (
      <>
        {Icon ? <Icon aria-hidden /> : null}
        <span className="flex-1">{action.label}</span>
      </>
    );

    if (action.href && !action.disabled) {
      return (
        <DropdownMenuItem key={action.key} asChild>
          <Link href={action.href}>{content}</Link>
        </DropdownMenuItem>
      );
    }

    return (
      <DropdownMenuItem
        key={action.key}
        variant={action.destructive ? "destructive" : "default"}
        disabled={action.disabled || action.loading}
        title={action.disabled ? action.disabledReason : undefined}
        onSelect={() => {
          onInvoke();
          action.onSelect?.();
        }}
      >
        {content}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      {regular.map(item)}
      {regular.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
      {destructive.map(item)}
    </>
  );
}

/**
 * قائمة «⋯» لما ندر استعماله. لا تُرسم إن لم يبقَ فيها فعل بعد الصلاحيات.
 */
export function ActionMenu({
  actions,
  label = "إجراءات أخرى",
  variant = "outline",
  size = "icon",
  className,
}: {
  actions: readonly ActionDef[];
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: "icon" | "icon-sm" | "icon-xs";
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          ref={triggerRef}
          label={label}
          icon={MoreHorizontal}
          variant={variant}
          size={size}
          className={className}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          // إن فتح العنصر نافذة فهي صاحبة التركيز الآن وستعيده إلى هذا الزر
          // عند إغلاقها؛ وإلا يعود التركيز إلى الزر كما يفعل Radix عادة.
          event.preventDefault();
          window.requestAnimationFrame(() => {
            const active = document.activeElement;

            if (!active || active === document.body) triggerRef.current?.focus();
          });
        }}
      >
        <MenuItems
          actions={actions}
          onInvoke={() => rememberMenuInvoker(triggerRef.current)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
