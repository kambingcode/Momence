import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uji e2e menjalankan server kedua (port 3100) di samping `npm run dev`; folder build terpisah
  // agar keduanya tidak menulis cache yang sama.
  distDir: process.env.CLIPSTUDIO_NEXT_DIST_DIR || ".next",
  // Indikator dev Next di kanan bawah: kiri bawah dipakai sidebar (status penyimpanan & worker).
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
