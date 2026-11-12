import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { projects } = await getContainer();
  const project = await projects.get.execute(id);
  if (!project)
    return NextResponse.json(
      { error: "Proyek tidak ditemukan" },
      { status: 404 },
    );
  return NextResponse.json({ project });
}

/** Hapus proyek beserta semua data & file medianya; 409 selama worker mengerjakan job-nya. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { projects } = await getContainer();
  const result = await projects.delete.execute(id);
  switch (result.status) {
    case "deleted":
      return new NextResponse(null, { status: 204 });
    case "not_found":
      return NextResponse.json(
        { error: "Proyek tidak ditemukan" },
        { status: 404 },
      );
    case "busy":
      return NextResponse.json(
        {
          error:
            "Worker sedang mengerjakan job proyek ini. Tunggu sampai selesai, lalu hapus lagi.",
          jobType: result.jobType,
        },
        { status: 409 },
      );
  }
}
