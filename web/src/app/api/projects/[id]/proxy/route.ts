import { NextResponse, type NextRequest } from "next/server";
import { getContainer } from "@/server/container";

/**
 * Video proxy (MP4) untuk pratinjau. Mendukung header Range (206) — wajib agar `<video>`
 * bisa di-seek — dan di-stream dari disk tanpa memuat seluruh file ke memori.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { projects } = await getContainer();
  const video = await projects.openProxy.execute(
    id,
    request.headers.get("range"),
  );

  switch (video.status) {
    case "not_found":
      return NextResponse.json(
        { error: "Proyek tidak ditemukan" },
        { status: 404 },
      );
    case "not_ready":
      return NextResponse.json(
        { error: "Video pratinjau belum siap" },
        { status: 404 },
      );
    case "unsatisfiable":
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${video.size}` },
      });
    case "ok": {
      const { start, end } = video.range ?? { start: 0, end: video.size - 1 };
      const headers = new Headers({
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Cache-Control": "no-cache",
      });
      if (video.range)
        headers.set("Content-Range", `bytes ${start}-${end}/${video.size}`);
      return new Response(video.stream, {
        status: video.range ? 206 : 200,
        headers,
      });
    }
  }
}
