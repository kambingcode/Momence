import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

/** Antre render MP4 klip dari EditingScript yang tersimpan; 202 + job untuk dipantau. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { render } = await getContainer();
  const result = await render.start.execute(id);
  switch (result.status) {
    case "started":
      return NextResponse.json({ job: result.job }, { status: 202 });
    case "not_found":
      return NextResponse.json(
        { error: "Klip tidak ditemukan" },
        { status: 404 },
      );
    case "invalid":
      return NextResponse.json({ error: result.message }, { status: 422 });
  }
}
