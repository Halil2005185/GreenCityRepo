"use client";

import { Check, Copy, MailCheck, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
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
import type { FieldIssuedLink, FieldIssuedLinks } from "@/lib/api/field";
import { countAr } from "@/lib/text/plural-ar";
import { cn, formatDate } from "@/lib/utils";

const LINKS = {
  one: "رابط واحد",
  two: "رابطان",
  few: "روابط",
  many: "رابطًا",
  other: "رابط",
};

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);

    return true;
  } catch {
    toast.error("تعذّر النسخ تلقائيًا. حدّد النص وانسخه يدويًا.");

    return false;
  }
}

/**
 * الروابط كما وُلّدت — تُعرض **مرة واحدة**.
 *
 * الخادم يحفظ بصمة الرابط لا نصّه، فما لم يُنسخ أو يُرسَل من هذه النافذة لا
 * يُسترجع؛ يُولَّد غيره. لذلك لا تُغلق بنقرة خارجها، وفيها «نسخ الكل» لمن
 * يوزّع من جدول.
 */
export function LinksDialog({
  issued,
  open,
  onOpenChange,
}: {
  issued: FieldIssuedLinks | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        {issued ? <Issued issued={issued} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Issued({ issued }: { issued: FieldIssuedLinks }) {
  const { links } = issued;
  const mailed = links.filter((link) => link.emailed).length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>وُلّد {countAr(links.length, LINKS)}</DialogTitle>
        <DialogDescription>
          صالحة حتى {formatDate(issued.expiresAt)}. لكل متطوع رابطه، وما كان له
          قبله أُبطل.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <Alert variant="warning">
          الروابط تظهر الآن فقط: النظام يحفظ بصمتها لا نصّها. انسخها أو أرسلها
          قبل أن تغلق النافذة، وما فاتك منها تولّد بديله.
        </Alert>

        {mailed > 0 ? (
          <Alert variant="info">
            أُدرج في صندوق البريد الصادر: {mailed}. من لا بريد له يُرسَل رابطه
            من هنا.
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            «واتساب» يفتح محادثة صاحب الرقم والرسالة مكتوبة؛ أنت من يضغط إرسال.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void copyText(
                links
                  .map((link) =>
                    [link.fullNameAr, link.phone ?? "", link.url].join("\t"),
                  )
                  .join("\n"),
                "نُسخت الروابط كلها، جدولًا يُلصق في ورقة.",
              )
            }
          >
            <Copy aria-hidden />
            نسخ الكل
          </Button>
        </div>

        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {links.map((link) => (
            <LinkRow key={link.participantId} link={link} />
          ))}
        </ul>
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">تم</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

function LinkRow({ link }: { link: FieldIssuedLink }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(link.messageAr, `نُسخت رسالة ${link.fullNameAr}.`)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {link.fullNameAr}
          {link.emailed ? (
            <Badge tone="success">
              <MailCheck aria-hidden />
              بالبريد
            </Badge>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {link.groupNameAr}
          {link.phone ? (
            <>
              {" · "}
              <bdi className="numeric">{link.phone}</bdi>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {link.whatsappUrl ? (
          <a
            href={link.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <MessageCircle aria-hidden />
            واتساب
          </a>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "نُسخت" : "نسخ الرسالة"}
        </Button>
      </div>
    </li>
  );
}
