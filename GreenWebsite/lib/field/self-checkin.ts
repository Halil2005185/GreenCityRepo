import { type FieldCard, FieldApiError, OfflineError, fieldFetch } from "./api";
import { enqueue, isTransient } from "./outbox";

/**
 * ما جرى لرمز الحضور بعد كتابته:
 *
 * - `recorded`: وصل الخادم وقبله، وهذه البطاقة بعده.
 * - `queued`: لم يصل — لا شبكة، أو الخادم متعثّر. محفوظ ويُرسَل لاحقًا.
 * - `refused`: رفضه الخادم، وهذا سببه.
 */
export type SelfCheckinOutcome =
  | { state: "recorded"; card: FieldCard }
  | { state: "queued" }
  | { state: "refused"; message: string };

/**
 * يسجّل حضور المتطوع برمز قائده.
 *
 * **الخادم أولًا، والطابور إن لم يُجب.** بقية ما يُسجَّل يمرّ بالطابور ويظهر
 * أثره فورًا؛ والرمز غير ذلك: قد يكون خاطئًا، ومن أخطأ في رقم يجب أن يعرف
 * الآن وهو عند نقطة اللقاء، لا أن يرى نفسه حاضرًا ثم يُرفض. فيُسأل الخادم
 * مباشرة، وما تعذّر سؤاله فيه يُحفظ بوقت كتابته ويُرسَل حين تعود الشبكة.
 */
export async function submitSelfCheckin(input: {
  groupId: string;
  groupNameAr: string | null;
  code: string;
}): Promise<SelfCheckinOutcome> {
  const scannedAt = new Date().toISOString();

  try {
    const card = await fieldFetch<FieldCard>("/field/me/checkin", {
      method: "POST",
      body: {
        clientId: crypto.randomUUID(),
        groupId: input.groupId,
        code: input.code,
        scannedAt,
      },
    });

    return { state: "recorded", card };
  } catch (error) {
    if (error instanceof FieldApiError) {
      if (!isTransient(error)) {
        return { state: "refused", message: error.message };
      }
    } else if (!(error instanceof OfflineError)) {
      throw error;
    }
  }

  /**
   * معرّف جديد في الطابور: إن كان الطلب الأول وصل وضاع جوابه فالمتطوع حاضر
   * سلفًا، والخادم لا يكتب له حضورًا ثانيًا في اليوم نفسه.
   */
  await enqueue({
    kind: "self-checkin",
    groupId: input.groupId,
    label: input.groupNameAr
      ? `تسجيل حضوري — ${input.groupNameAr}`
      : "تسجيل حضوري",
    payload: { code: input.code, scannedAt },
  });

  return { state: "queued" };
}
