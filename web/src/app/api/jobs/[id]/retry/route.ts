import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

/** Ulang job yang gagal (payload sama); 409 bila job tidak sedang gagal. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { jobs } = await getContainer();
  const result = await jobs.retry.execute(id);
  switch (result.status) {
    case "queued":
      return NextResponse.json({ job: result.job }, { status: 202 });
    case "not_found":
      return NextResponse.json(
        { error: "Job tidak ditemukan" },
        { status: 404 },
      );
    case "not_failed":
      return NextResponse.json(
        { error: "Hanya job yang gagal yang bisa diulang.", job: result.job },
        { status: 409 },
      );
  }
}
