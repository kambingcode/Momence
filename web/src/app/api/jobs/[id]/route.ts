import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { jobs } = await getContainer();
  const job = await jobs.get.execute(id);
  if (!job)
    return NextResponse.json({ error: "Job tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ job });
}
