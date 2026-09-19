import { RevealGroup } from "@/components/ui/reveal";
import { PARTNERSHIP_JOURNEY } from "@/lib/content/partnership";
import { revealDelay } from "@/lib/utils";

/**
 * مسار الشراكة الأربع خطوات. مكوّن واحد لأن الصفحتين اللتين تعرضانه —
 * «الشركاء» و«انضم إلينا» — كانتا تكرران الترميز نفسه، فيتباعد شكلاهما
 * عند أول تعديل على إحداهما.
 *
 * نصّ الخطوات من `lib/content/partnership.ts`: هو الميثاق لا بيانات تشغيل.
 */
export function PartnershipJourney() {
  return (
    <RevealGroup>
      <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {PARTNERSHIP_JOURNEY.map((step, index) => (
          <li
            key={step.title}
            className="reveal space-y-3"
            style={revealDelay(index, 80)}
          >
            <span className="numeric flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {index + 1}
            </span>
            <h3 className="text-base font-bold text-foreground">{step.title}</h3>
            <p className="text-sm leading-loose text-muted-foreground">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </RevealGroup>
  );
}
