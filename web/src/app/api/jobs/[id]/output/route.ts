import { NextResponse } from "next/server";
import {
  attachmentHeader,
  downloadFileName,
} from "@/modules/render/application";
import { getContainer } from "@/server/container";

/** Unduh MP4 hasil job render, di-stream dari disk. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { render } = await getContainer();
  const output = await render.openOutput.execute(id);
  switch (output.status) {
    case "not_found":
      return NextResponse.json(
        { error: "Hasil render tidak ditemukan" },
        { status: 404 },
      );
    case "not_ready":
      return NextResponse.json(
        { error: "Render belum selesai" },
        { status: 409 },
      );
    case "ok":
      return new Response(output.stream, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(output.size),
          "Content-Disposition": attachmentHeader(
            downloadFileName(output.title),
          ),
          "Cache-Control": "no-store",
        },
      });
  }
}
