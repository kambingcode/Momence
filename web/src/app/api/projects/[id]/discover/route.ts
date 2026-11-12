import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";
import { discoverRequestSchema } from "@/shared/schemas";

/**
 * "Cari ulang klip": simpan fokus klip baru lalu antre job `discover`. 404 bila proyek tidak ada,
 * 409 bila proyek masih diproses atau transkripnya belum selesai.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = discoverRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body tidak valid." },
      { status: 400 },
    );
  }

  const { projects } = await getContainer();
  const result = await projects.rediscover.execute({
    projectId: id,
    clipFocus: parsed.data.clipFocus,
  });
  switch (result.status) {
    case "queued":
      return NextResponse.json({ job: result.job }, { status: 202 });
    case "not_found":
      return NextResponse.json(
        { error: "Proyek tidak ditemukan." },
        { status: 404 },
      );
    case "not_ready":
      return NextResponse.json({ error: result.message }, { status: 409 });
    case "busy":
      return NextResponse.json(
        {
          error:
            "Proyek masih diproses. Tunggu sampai selesai, lalu cari ulang klip.",
          jobType: result.jobType,
        },
        { status: 409 },
      );
  }
}
