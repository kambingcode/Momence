import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";
import { saveEditingScriptBodySchema } from "@/shared/schemas";

/** Simpan EditingScript utuh. 409 bila versi berbeda (body membawa versi terkini). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = saveEditingScriptBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    // Pesan aturan teks custom (batas jumlah, posisi, ukuran, …) ditujukan ke pengguna.
    const issue = parsed.error.issues.find(
      (i) => i.path[0] === "script" && i.path[1] === "textOverlays",
    );
    return NextResponse.json(
      {
        error: issue
          ? `Data editan tidak valid: ${issue.message}`
          : "Data editan tidak valid",
      },
      { status: 400 },
    );
  }

  const { editor } = await getContainer();
  const result = await editor.save.execute(id, parsed.data);
  switch (result.status) {
    case "saved":
      return NextResponse.json({ editingScript: result.editingScript });
    case "not_found":
      return NextResponse.json(
        { error: "Klip tidak ditemukan" },
        { status: 404 },
      );
    case "invalid":
      return NextResponse.json({ error: result.message }, { status: 400 });
    case "stale":
      return NextResponse.json(
        {
          error:
            "Transkrip klip ini berubah sejak editor dibuka. Muat ulang editor.",
        },
        { status: 409 },
      );
    case "conflict":
      return NextResponse.json(
        {
          error: "Klip ini sudah disimpan dari tempat lain.",
          current: result.current,
        },
        { status: 409 },
      );
  }
}
