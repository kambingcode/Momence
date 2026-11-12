/**
 * Rangka halaman editor: setinggi layar di `lg+` (kolom menggulir sendiri-sendiri, halaman tidak),
 * mengalir biasa di layar sempit. Header (`EditorHeader`) dan isi dirender oleh anak-anaknya.
 */
export function EditorShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      {children}
    </main>
  );
}
