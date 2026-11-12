import { ProjectFrame } from "@/features/projects/ui/project-frame";

/** Kepala proyek & tab Klip | Transkrip, bertahan saat berpindah tab. */
export default async function ProjectLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return <ProjectFrame projectId={id}>{children}</ProjectFrame>;
}
