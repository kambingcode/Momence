import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";
import { brollPlanBodySchema } from "@/shared/schemas";

const notFound = () =>
  NextResponse.json({ error: "Klip tidak ditemukan" }, { status: 404 });

/** Rencana B-roll terbaru klip (siap / berjalan / gagal / belum) + slotnya. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { broll } = await getContainer();
  const plan = await broll.getPlan.execute(id);
  return plan ? NextResponse.json(plan) : notFound();
}

/** Antre rencana B-roll dari editan yang sedang dibuka; 202 + job (yang berjalan dipakai ulang). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = brollPlanBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Data editan tidak valid" },
      { status: 400 },
    );
  const { broll } = await getContainer();
  const result = await broll.startPlan.execute(id, parsed.data);
  switch (result.status) {
    case "started":
      return NextResponse.json({ job: result.job }, { status: 202 });
    case "not_found":
      return notFound();
    case "invalid":
      return NextResponse.json({ error: result.message }, { status: 422 });
  }
}
