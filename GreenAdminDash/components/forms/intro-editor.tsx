"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { ImageField } from "@/components/ui/image-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { FormDetail } from "@/lib/api/forms";
import { cn } from "@/lib/utils";

type IntroDoc = NonNullable<FormDetail["introJson"]>;

/**
 * ما يُشغَّل من المحرّر يطابق ما يقبله الخادم عقدةً بعقدة.
 *
 * زرٌّ يكتب عقدةً يرفضها المخطّط يعني حفظًا يفشل بعد أن كتب الموظف فقرة —
 * فالتعطيل هنا هو نفسه قائمة السماح هناك: فقرة وعنوان فرعي وقائمتان،
 * وغامق ومائل ورابط.
 */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [3] },
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: false,
    // بروتوكولان لا غير: المخطّط على الخادم يرفض ما عداهما.
    protocols: ["http", "https"],
  }),
];

/** مستند بلا نصّ يُحفظ `null`: فقرة فارغة ليست مقدّمة. */
function docOrNull(doc: IntroDoc, text: string): IntroDoc | null {
  return text.trim().length > 0 ? doc : null;
}

const TOOL_CLASS =
  "rounded-md border border-transparent p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(TOOL_CLASS, active && "border-border bg-accent text-foreground")}
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}

function isWebUrl(value: string) {
  try {
    const url = new URL(value);

    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * الرابط في نافذة منبثقة بجوار زرّه بدل `window.prompt`: الأخيرة تقطع
 * الكتابة بنافذة المتصفح، ولا تقبل تصحيحًا ولا تحقّقًا قبل الإدراج.
 * بروتوكولان لا غير لأن المخطّط على الخادم يرفض ما عداهما.
 */
function LinkButton({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const active = editor.isActive("link");
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("https://");
  const [invalid, setInvalid] = useState(false);

  function apply() {
    const value = href.trim();

    if (!isWebUrl(value)) {
      setInvalid(true);
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setHref((editor.getAttributes("link").href as string | undefined) ?? "https://");
          setInvalid(false);
        }
      }}
    >
      <SimpleTooltip label={active ? "تعديل الرابط" : "إضافة رابط"}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={active ? "تعديل الرابط" : "إضافة رابط"}
            aria-pressed={active}
            className={cn(TOOL_CLASS, active && "border-border bg-accent text-foreground")}
          >
            <LinkIcon className="size-4" />
          </button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent className="space-y-2">
        <Label htmlFor="intro-link-href">عنوان الرابط</Label>
        <Input
          id="intro-link-href"
          dir="ltr"
          className="text-start"
          value={href}
          aria-invalid={invalid}
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
        {invalid ? (
          <p className="text-xs text-destructive" role="alert">
            رابط كامل يبدأ بـ <span dir="ltr">https://</span>
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {active ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
            >
              إزالة الرابط
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={apply}>
            {active ? "حفظ الرابط" : "إضافة الرابط"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * محرّر مقدّمة الاستمارة: ما يراه الزائر فوق الأسئلة.
 *
 * الحفظ بزرّ لا مع كل ضغطة مفتاح: كل ضغطة كانت ستصير طلبًا، والمقدّمة نصّ
 * يُكتب ويُراجع لا حقل تبديل.
 */
export function IntroEditor({
  intro,
  coverImageUrl,
  saving,
  onSave,
}: {
  intro: IntroDoc | null;
  coverImageUrl: string | null;
  saving: boolean;
  onSave: (input: {
    introJson: IntroDoc | null;
    coverImageUrl: string | null;
  }) => void;
}) {
  const [cover, setCover] = useState(coverImageUrl ?? "");

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: intro ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_h3]:text-base [&_h3]:font-bold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-5 [&_ol]:ps-5 [&_a]:text-primary [&_a]:underline",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="space-y-4">
      <ImageField
        label="صورة عرضية"
        hint="تظهر في رأس الاستمارة. JPEG أو PNG أو WebP، حتى خمسة ميغابايت."
        value={cover || null}
        purpose="FORM_COVER"
        onChange={(url) => setCover(url ?? "")}
      />

      <div className="space-y-1.5">
        <p className="text-sm font-medium">المقدّمة</p>

        <div className="flex flex-wrap gap-1 rounded-md border border-border p-1">
          <ToolbarButton
            label="غامق"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </ToolbarButton>

          <ToolbarButton
            label="مائل"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </ToolbarButton>

          <ToolbarButton
            label="عنوان فرعي"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <Heading3 className="size-4" />
          </ToolbarButton>

          <ToolbarButton
            label="قائمة نقطية"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" />
          </ToolbarButton>

          <ToolbarButton
            label="قائمة مرقّمة"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-4" />
          </ToolbarButton>

          <LinkButton editor={editor} />
        </div>

        <EditorContent editor={editor} />
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          loading={saving}
          onClick={() =>
            onSave({
              // شكل Tiptap فضفاض والخادم يتحقّق عقدةً بعقدة، فالتأكيد هنا لا يخدع أحدًا.
              introJson: docOrNull(
                editor.getJSON() as IntroDoc,
                editor.getText(),
              ),
              coverImageUrl: cover.trim() || null,
            })
          }
        >
          حفظ المقدّمة
        </Button>
      </div>
    </div>
  );
}
