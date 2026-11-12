import { NextResponse } from "next/server";
import { InvalidVideoUrlError } from "@/modules/projects/application";
import { getContainer } from "@/server/container";
import { importVideoRequestSchema } from "@/shared/schemas";

/** Impor video dari link YouTube atau VOD Twitch: buat proyek lalu antre job `download` untuk worker. */
export async function POST(request: Request) {
  const parsed = importVideoRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body tidak valid." },
      { status: 400 },
    );
  }

  const { projects } = await getContainer();
  try {
    const result = await projects.importFromUrl.execute(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidVideoUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
