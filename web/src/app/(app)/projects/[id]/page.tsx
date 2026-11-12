import type { Metadata } from "next";
import { TranscriptPage } from "@/features/transcript/ui/transcript-page";

export const metadata: Metadata = { title: "Transkrip · Momence" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TranscriptPage projectId={id} />;
}
