import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";

/** Thumbnail JPEG proyek. 404 selama belum ada (ingest berjalan atau gagal membuatnya). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { projects } = await getContainer();
  const thumbnail = await projects.openThumbnail.execute(id);

  switch (thumbnail.status) {
    case "not_found":
      return NextResponse.json(
        { error: "Proyek tidak ditemukan" },
        { status: 404 },
      );
    case "not_ready":
      return NextResponse.json(
        { error: "Thumbnail belum siap" },
        { status: 404 },
      );
    case "ok":
      return new Response(thumbnail.stream, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(thumbnail.size),
          // Dihasilkan ulang bila ingest diulang; semenit cukup untuk daftar yang di-polling.
          "Cache-Control": "private, max-age=60",
        },
      });
  }
}
