import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

/** Klip proyek hasil discover, urut peringkat; `{ clips: [] }` bila belum ada. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { clips } = await getContainer();
  return NextResponse.json({ clips: await clips.listForProject.execute(id) });
}
