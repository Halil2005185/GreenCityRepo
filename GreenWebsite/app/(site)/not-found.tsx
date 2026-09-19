import { NotFoundContent } from "@/components/sections/not-found-content";

/**
 * ما تعرضه `notFound()` حين تُستدعى داخل `(site)` — من صفحة مبادرة أو
 * برنامج بـslug غير منشور. القشرة تأتي من تخطيط المجموعة، فالجسم وحده هنا.
 */
export default function NotFound() {
  return <NotFoundContent />;
}
