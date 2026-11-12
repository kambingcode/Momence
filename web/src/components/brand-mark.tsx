import { cn } from "cn";

/**
 * Logo: glyph belah ketupat bergradien violet (satu-satunya isian violet di aplikasi, DESIGN.md →
 * Brand Logo Mark) + wordmark "Momence" (Outfit, warna teks utama). Bobot 500 diset langsung
 * karena wordmark memakai font tersendiri.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-foreground inline-flex items-center gap-2.5 text-2xl leading-none tracking-tight",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-4 shrink-0 rotate-45 rounded-xs"
        style={{
          background:
            "conic-gradient(from 225deg, rgb(133 92 247 / 0.12), var(--color-logo-violet))",
        }}
      />
      <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 500 }}>
        Momence
      </span>
    </span>
  );
}
