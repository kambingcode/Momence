import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

/** Transkrip video sumber proyek; `{ transcript: null }` bila belum tersedia. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { transcripts } = await getContainer();
  return NextResponse.json({
    transcript: await transcripts.getForProject.execute(id),
  });
}
