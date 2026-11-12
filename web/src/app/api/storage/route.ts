import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

/** Pemakaian disk per proyek & total, plus sisa ruang disk. */
export async function GET() {
  const { projects } = await getContainer();
  return NextResponse.json(await projects.storage.execute());
}
