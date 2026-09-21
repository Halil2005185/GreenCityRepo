"use client";

import { useId } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Label } from "@/components/ui/field";
import { ImageField } from "@/components/ui/image-field";
import { Select, type SelectOption, type SelectProps } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { UploadPurpose } from "@/lib/api/uploads";
import { cn } from "@/lib/utils";

/**
 * حقول النماذج على react-hook-form وzod و`Field`. كل حقل يربط تسميته
 * ورسالة خطئه بالعنصر (`aria-invalid` و`aria-describedby`) عبر `Field`،
 * فلا تتكرر الطريقة الثلاثية القديمة (react-hook-form وFormData وحالة
 * يدوية) في صفحات مختلفة.
 */
type BaseProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
};

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  className,
  ...inputProps
}: BaseProps<T> & Omit<React.ComponentProps<"input">, "name" | "value" | "onChange" | "defaultValue">) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field id={id} label={label} hint={hint} error={fieldState.error?.message}>
          {(aria) => (
            <Input
              {...aria}
              {...inputProps}
              ref={field.ref}
              name={field.name}
              value={(field.value as string | number | undefined) ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className={className}
            />
          )}
        </Field>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  className,
  ...textareaProps
}: BaseProps<T> &
  Omit<React.ComponentProps<"textarea">, "name" | "value" | "onChange" | "defaultValue">) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field id={id} label={label} hint={hint} error={fieldState.error?.message}>
          {(aria) => (
            <Textarea
              {...aria}
              {...textareaProps}
              ref={field.ref}
              name={field.name}
              value={(field.value as string | undefined) ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className={className}
            />
          )}
        </Field>
      )}
    />
  );
}

type SelectFieldProps<T extends FieldValues> = BaseProps<T> &
  Omit<SelectProps, "value" | "onChange" | "multiple" | "selectedOption" | "selectedOptions" | "id"> & {
    multiple?: boolean;
    selectedOption?: SelectOption | null;
    selectedOptions?: readonly SelectOption[];
  };

/** قيمة الحقل نص (أو مصفوفة نصوص مع `multiple`)؛ الفارغ `""` لا `null`. */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  multiple = false,
  selectedOption,
  selectedOptions,
  ...selectProps
}: SelectFieldProps<T>) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field id={id} label={label} hint={hint} error={fieldState.error?.message}>
          {(aria) =>
            multiple ? (
              <Select
                {...selectProps}
                {...aria}
                multiple
                value={(field.value as string[] | undefined) ?? []}
                selectedOptions={selectedOptions}
                onChange={(values) => {
                  field.onChange(values);
                  field.onBlur();
                }}
              />
            ) : (
              <Select
                {...selectProps}
                {...aria}
                value={(field.value as string | undefined) || null}
                selectedOption={selectedOption}
                onChange={(value) => {
                  field.onChange(value ?? "");
                  field.onBlur();
                }}
              />
            )
          }
        </Field>
      )}
    />
  );
}

/** مربع اختيار واحد بتسميته بجانبه — «إجابة إلزامية»، «جهة الاتصال الرئيسية». */
export function CheckboxField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
}: BaseProps<T>) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start gap-2.5">
          <Checkbox
            id={id}
            ref={field.ref}
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            onBlur={field.onBlur}
            aria-describedby={hint ? `${id}-hint` : undefined}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor={id} className="font-normal">
              {label}
            </Label>
            {hint ? (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                {hint}
              </p>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
}: BaseProps<T>) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor={id}>{label}</Label>
            {hint ? (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                {hint}
              </p>
            ) : null}
          </div>
          <Switch
            id={id}
            ref={field.ref}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            aria-describedby={hint ? `${id}-hint` : undefined}
          />
        </div>
      )}
    />
  );
}

/**
 * مجموعة مربعات لقيم متعددة من قائمة قصيرة ثابتة (أشكال الدعم السبعة).
 * القوائم الطويلة أو المتغيّرة تستعمل `SelectField` مع `multiple`.
 */
export function CheckboxGroupField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  options,
  columns = 2,
}: BaseProps<T> & { options: readonly SelectOption[]; columns?: 1 | 2 }) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected = (field.value as string[] | undefined) ?? [];
        const error = fieldState.error?.message;

        return (
          <fieldset
            className="space-y-2"
            aria-describedby={[hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
          >
            <legend className="text-sm font-medium">{label}</legend>
            {hint ? (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                {hint}
              </p>
            ) : null}
            <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
              {options.map((option, index) => {
                const optionId = `${id}-${index}`;
                const checked = selected.includes(option.value);

                return (
                  <label
                    key={option.value}
                    htmlFor={optionId}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-sm transition-colors hover:bg-accent/50",
                      checked && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <Checkbox
                      id={optionId}
                      ref={index === 0 ? field.ref : undefined}
                      checked={checked}
                      onCheckedChange={(next) =>
                        field.onChange(
                          next === true
                            ? [...selected, option.value]
                            : selected.filter((value) => value !== option.value),
                        )
                      }
                      className="mt-0.5"
                    />
                    <span>
                      {option.label}
                      {option.description ? (
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {error ? (
              <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </fieldset>
        );
      }}
    />
  );
}

/** حقل صورة مرفوعة؛ القيمة رابطها أو `""`. */
export function ImageFormField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  purpose,
}: BaseProps<T> & { purpose: UploadPurpose }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <ImageField
            label={label}
            hint={hint}
            purpose={purpose}
            value={(field.value as string | undefined) || null}
            onChange={(url) => field.onChange(url ?? "")}
          />
          {fieldState.error?.message ? (
            <p className="text-xs text-destructive" role="alert">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
