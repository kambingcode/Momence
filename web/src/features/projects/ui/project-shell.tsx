import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Isi halaman di dalam kerangka aplikasi: tautan kembali (opsional; navigasi utama ada di sidebar)
 * + judul halaman.
 */
export function ProjectShell({
  title,
  back,
  children,
}: {
  title?: string;
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <main className="max-w-page mx-auto space-y-6 px-4 py-8 lg:px-10 lg:py-10">
      {back && (
        <Link
          href={back.href}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      {title && (
        <h1
          className="truncate text-2xl font-medium tracking-tight"
          title={title}
        >
          {title}
        </h1>
      )}
      {children}
    </main>
  );
}
