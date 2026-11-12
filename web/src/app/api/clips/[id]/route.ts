import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

/** Data editor klip: klip, token transkrip di rentangnya, EditingScript tersimpan. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { editor } = await getContainer();
  const data = await editor.open.execute(id);
  if (!data)
    return NextResponse.json(
      { error: "Klip tidak ditemukan" },
      { status: 404 },
    );
  return NextResponse.json(data);
}
