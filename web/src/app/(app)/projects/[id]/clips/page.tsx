import type { Metadata } from "next";
import { ClipsPage } from "@/features/clips/ui/clips-page";

export const metadata: Metadata = { title: "Klip · Momence" };

export default async function ProjectClipsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClipsPage projectId={id} />;
}
