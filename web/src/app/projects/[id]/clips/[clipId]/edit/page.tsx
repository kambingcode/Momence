import type { Metadata } from "next";
import { ClipEditorPage } from "@/features/editor/ui/clip-editor-page";

export const metadata: Metadata = { title: "Editor · Momence" };

export default async function EditClipPage({
  params,
}: {
  params: Promise<{ id: string; clipId: string }>;
}) {
  const { id, clipId } = await params;
  return <ClipEditorPage projectId={id} clipId={clipId} />;
}
