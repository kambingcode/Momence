import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

const notFound = () =>
  NextResponse.json({ error: "Klip tidak ditemukan" }, { status: 404 });

/** Status auto-reframe klip (siap / berjalan / gagal / belum) + jalur crop per rasio. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { reframe } = await getContainer();
  const state = await reframe.get.execute(id);
  return state ? NextResponse.json(state) : notFound();
}

/** Antre analisis wajah klip ini; 202 + job (job yang sudah berjalan dipakai ulang). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { reframe } = await getContainer();
  const result = await reframe.start.execute(id);
  return result.status === "started"
    ? NextResponse.json({ job: result.job }, { status: 202 })
    : notFound();
}
