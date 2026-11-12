import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { noopPayloadSchema } from "@/shared/schemas";
import { getContainer } from "@/server/container";

// Hanya job uji yang boleh dibuat langsung lewat API; job lain diantre oleh use case-nya.
const createJobBody = z.object({
  type: z.literal("noop"),
  payload: noopPayloadSchema.default({ durationMs: 2000 }),
});

const listQuery = z.object({
  projectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = createJobBody.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { jobs } = await getContainer();
  const job = await jobs.enqueue.execute({ ...parsed.data, projectId: null });
  return NextResponse.json({ job }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const parsed = listQuery.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { jobs } = await getContainer();
  return NextResponse.json({ jobs: await jobs.list.execute(parsed.data) });
}
