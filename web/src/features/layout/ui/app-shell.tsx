import { AppSidebar } from "./app-sidebar";

/**
 * Kerangka halaman aplikasi (beranda, proyek, Pengaturan): sidebar kiri di `lg+`, bar atas di
 * bawahnya. Dipasang sekali di layout route group `(app)` sehingga sidebar tidak dimuat ulang
 * saat berpindah halaman. Editor klip berada di luar group ini (layar penuh).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#konten"
        className="bg-primary text-primary-foreground focus-visible:ring-ring/40 sr-only z-50 rounded-3xl px-4 py-2 text-sm font-medium outline-none focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-3"
      >
        Lewati ke konten
      </a>
      <AppSidebar />
      <div id="konten" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        {children}
      </div>
    </div>
  );
}
