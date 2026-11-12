import type { Metadata } from "next";
import { SettingsPage } from "@/features/settings/ui/settings-page";

export const metadata: Metadata = { title: "Pengaturan · Momence" };

export default function Settings() {
  return <SettingsPage />;
}
