import { encode } from "uqr";

/**
 * رمز مربّع (QR) مسارًا واحدًا في SVG: يُرسم من مصفوفته، فلا صورة تُجلب ولا
 * HTML يُحقن، ويُطبع حادًّا بأي حجم. بلا خطافات، فيُرسم على الخادم أيضًا.
 *
 * أسود على أبيض دائمًا: يُمسح بكاميرا، والكاميرا لا تعرف ألوان الهوية.
 */
export function QrImage({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const qr = encode(text, { ecc: "M", border: 2 });
  const cells: string[] = [];

  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) cells.push(`M${x} ${y}h1v1h-1z`);
    });
  });

  const size = qr.size;
  const path = cells.join("");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
