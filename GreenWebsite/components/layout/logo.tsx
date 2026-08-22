/**
 * الشعار المؤقت: شجرة مبسّطة بلون `currentColor` فتتبع السمة الداكنة
 * والفاتحة بلا نسختين. يُستبدل بالشعار الرسمي حين يعتمده مكتب الإعلام.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path
        d="M16 3.5c4.4 0 8 3.4 8 7.6 0 1.5-.5 2.9-1.3 4.1 2 .8 3.3 2.6 3.3 4.7 0 2.9-2.5 5.2-5.6 5.2h-8.8C8.5 25.1 6 22.8 6 19.9c0-2.1 1.3-3.9 3.3-4.7A7.4 7.4 0 0 1 8 11.1c0-4.2 3.6-7.6 8-7.6Z"
        fill="currentColor"
        opacity=".18"
      />
      <path
        d="M16 3.5c4.4 0 8 3.4 8 7.6 0 1.5-.5 2.9-1.3 4.1 2 .8 3.3 2.6 3.3 4.7 0 2.9-2.5 5.2-5.6 5.2h-8.8C8.5 25.1 6 22.8 6 19.9c0-2.1 1.3-3.9 3.3-4.7A7.4 7.4 0 0 1 8 11.1c0-4.2 3.6-7.6 8-7.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 28.5V15m0 3.5 3.5-3.5M16 21l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
