"use client";

import { Lock } from "lucide-react";
import { useId, useMemo } from "react";
import { type Control, Controller, type FieldValues, type Path } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CAPABILITY_GROUP_LABELS, type CapabilityDefinition } from "@/lib/api/roles";
import { cn } from "@/lib/utils";

type ChecklistProps = {
  catalog: readonly CapabilityDefinition[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /**
   * حزمة الدور في نافذة التخصيص: ما يخالفها يُعلَّم «مضافة» أو «منزوعة»،
   * فيرى المدير ما غيّره هو عمّا يأتي مع الدور.
   */
  baseline?: readonly string[];
  /** ما لا يستطيع المستخدم تغييره يُعرض بقفل للقراءة، لا يُخفى. */
  canChange?: (capability: string) => boolean;
};

/**
 * قائمة القدرات مجمّعة بمجموعات الكتالوج — لحزمة دور أو لعضوية واحدة.
 *
 * الصف غير القابل للتغيير يبقى ظاهرًا بقفل بدل أن يختفي: من يخصّص عضوية
 * يحتاج أن يرى الصورة كاملة، حتى ما لا يملك أن يمسّه منها.
 */
export function CapabilityChecklist({
  catalog,
  value,
  onChange,
  baseline,
  canChange = () => true,
}: ChecklistProps) {
  const id = useId();
  const selected = useMemo(() => new Set(value), [value]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, CapabilityDefinition[]>();

    for (const capability of catalog) {
      byGroup.set(capability.group, [...(byGroup.get(capability.group) ?? []), capability]);
    }

    return [...byGroup];
  }, [catalog]);

  function toggle(key: string, checked: boolean) {
    onChange(checked ? [...value, key] : value.filter((existing) => existing !== key));
  }

  return (
    <div className="space-y-5">
      {groups.map(([group, capabilities]) => {
        const held = capabilities.filter((capability) => selected.has(capability.key)).length;

        return (
          <fieldset key={group} className="space-y-2">
            <legend className="flex w-full items-center justify-between text-sm font-medium">
              <span>{CAPABILITY_GROUP_LABELS[group] ?? group}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {held} من {capabilities.length}
              </span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {capabilities.map((capability) => {
                const rowId = `${id}-${capability.key}`;
                const checked = selected.has(capability.key);
                const editable = canChange(capability.key);
                const inBaseline = baseline?.includes(capability.key);
                const change =
                  baseline === undefined || checked === inBaseline
                    ? null
                    : checked
                      ? "granted"
                      : "revoked";

                return (
                  <label
                    key={capability.key}
                    htmlFor={rowId}
                    className={cn(
                      "flex items-start gap-2 rounded-md border border-border p-2.5 text-sm transition-colors",
                      editable ? "cursor-pointer hover:bg-accent/50" : "cursor-default opacity-70",
                      checked && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <Checkbox
                      id={rowId}
                      checked={checked}
                      disabled={!editable}
                      onCheckedChange={(next) => toggle(capability.key, next === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span>{capability.nameAr}</span>
                        {change === "granted" ? <Badge tone="success">مضافة</Badge> : null}
                        {change === "revoked" ? <Badge tone="danger">منزوعة</Badge> : null}
                        {capability.tier === "ADMIN" ? <Badge tone="warning">إدارية</Badge> : null}
                      </span>
                      <span dir="ltr" className="block truncate text-start font-mono text-xs text-muted-foreground">
                        {capability.key}
                      </span>
                    </span>
                    {editable ? null : (
                      <Lock
                        aria-label="لا تملك منحها أو نزعها"
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/** القائمة نفسها حقلًا في نموذج `react-hook-form` — لحزمة دور. */
export function CapabilityChecklistField<T extends FieldValues>({
  control,
  name,
  ...props
}: Omit<ChecklistProps, "value" | "onChange"> & { control: Control<T>; name: Path<T> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-2">
          <CapabilityChecklist
            {...props}
            value={(field.value as string[] | undefined) ?? []}
            onChange={field.onChange}
          />
          {fieldState.error?.message ? (
            <p className="text-xs text-destructive">{fieldState.error.message}</p>
          ) : null}
        </div>
      )}
    />
  );
}
