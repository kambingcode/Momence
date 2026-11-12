import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";
import { postCopyBodySchema } from "@/shared/schemas";

const notFound = () =>
  NextResponse.json({ error: "Klip tidak ditemukan" }, { status: 404 });

/** Caption & hashtag terbaru klip (siap / berjalan / gagal / belum). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { social } = await getContainer();
  const copy = await social.getPostCopy.execute(id);
  return copy ? NextResponse.json(copy) : notFound();
}

/** Antre penulisan caption & hashtag; 202 + job (yang berjalan dipakai ulang). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = postCopyBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pilihan platform atau bahasa tidak valid" },
      { status: 400 },
    );
  const { social } = await getContainer();
  const result = await social.startPostCopy.execute(id, parsed.data);
  switch (result.status) {
    case "started":
      return NextResponse.json({ job: result.job }, { status: 202 });
    case "not_found":
      return notFound();
    case "invalid":
      return NextResponse.json({ error: result.message }, { status: 422 });
  }
}
