import { NextResponse } from "next/server";
import { z } from "zod";
import { getContainer } from "@/server/container";
import { aspectRatioSchema } from "@/shared/schemas";

const querySchema = z.object({
  q: z.string(),
  ratio: aspectRatioSchema.default("9:16"),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

/** Cari video stok (Pixabay) untuk B-roll; yang orientasinya sesuai rasio klip di depan. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    q: params.get("q") ?? "",
    ratio: params.get("ratio") ?? undefined,
    page: params.get("page") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "Parameter pencarian tidak valid" },
      { status: 400 },
    );
  const { broll } = await getContainer();
  const result = await broll.search.execute({
    query: parsed.data.q,
    aspectRatio: parsed.data.ratio,
    page: parsed.data.page,
  });
  switch (result.status) {
    case "ok":
      return NextResponse.json(result.result);
    case "invalid":
      return NextResponse.json({ error: result.message }, { status: 400 });
    case "unavailable":
      return NextResponse.json({ error: result.message }, { status: 503 });
    case "error":
      return NextResponse.json({ error: result.message }, { status: 502 });
  }
}
