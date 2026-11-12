import { NextResponse } from "next/server";
import { getContainer } from "@/server/container";
import { preferencesSchema } from "@/shared/schemas";

/** Pengaturan + status key (terisi/tidak) & worker. */
export async function GET() {
  const { settings } = await getContainer();
  return NextResponse.json(await settings.overview.execute());
}

/** Simpan pengaturan utuh; dipakai job & editor berikutnya. */
export async function PUT(request: Request) {
  const parsed = preferencesSchema.safeParse(
    await request.json().catch(() => null),
  );
  // Pesan isu pertama apa adanya: ditampilkan di form Pengaturan.
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Pengaturan tidak valid" },
      { status: 400 },
    );

  const { settings } = await getContainer();
  const result = await settings.save.execute(parsed.data);
  if (result.status === "invalid")
    return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ preferences: result.preferences });
}
