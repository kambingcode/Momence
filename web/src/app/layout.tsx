import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// globals.css (shadcn) membaca --font-sans untuk font-sans. Inter dimuat dengan sumbu `opsz`
// agar ukuran besar otomatis memakai bentuk "Display"; JetBrains Mono untuk label (pengganti Aux Mono).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: "400",
});

// Outfit hanya untuk wordmark "Momence" di BrandMark.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: "500",
});

export const metadata: Metadata = {
  title: "Momence",
  description: "Potong video panjang menjadi klip pendek — berjalan lokal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${jetbrainsMono.variable} ${outfit.variable}`}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
