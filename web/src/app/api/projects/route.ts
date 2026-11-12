import { NextResponse, type NextRequest } from "next/server";
import { InvalidVideoFileError } from "@/modules/projects/application";
import { getContainer } from "@/server/container";
import { clipFocusSchema } from "@/shared/schemas";

export async function GET() {
  const { projects } = await getContainer();
  return NextResponse.json({ projects: await projects.list.execute() });
}

/**
 * Upload video: body = isi file mentah (bukan multipart), nama file di `?filename=`, fokus klip
 * opsional di `?focus=`.
 * Body di-stream langsung ke disk sehingga file berukuran GB tidak dimuat ke memori.
 */
export async function POST(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename")?.trim();
  if (!filename) {
    return NextResponse.json(
      { error: "Parameter filename wajib diisi." },
      { status: 400 },
    );
  }
  if (!request.body) {
    return NextResponse.json(
      { error: "Body (isi file) kosong." },
      { status: 400 },
    );
  }

  const focus = clipFocusSchema.safeParse(
    request.nextUrl.searchParams.get("focus"),
  );
  if (!focus.success) {
    return NextResponse.json(
      { error: focus.error.issues[0]?.message ?? "Fokus klip tidak valid." },
      { status: 400 },
    );
  }

  const { projects } = await getContainer();
  try {
    const result = await projects.upload.execute({
      filename,
      clipFocus: focus.data,
      data: request.body,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidVideoFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
