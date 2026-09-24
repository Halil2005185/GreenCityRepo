import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/bg/logo.png"
      alt="المدن الخضراء"
      width={120}
      height={50}
      className={cn("h-auto w-auto object-contain", className)}
      priority
    />
  );
}

export function BrandLockup({
  className,
}: {
  className?: string;
}) {
  return <Logo className={className} />;
}