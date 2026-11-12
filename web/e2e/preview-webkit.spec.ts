import { expect, test } from "@playwright/test";
import type { Clip } from "@/modules/clips/application";
import type { ProjectListItem } from "@/modules/projects/application";
import { VIDEOS } from "./videos";

/**
 * Pratinjau editor di WebKit (mesin Safari), memakai proyek bahasa Indonesia yang dibuat suite
 * utama (project `chrome` adalah dependensinya). Regresi: Remotion menahan timeline di frame 0
 * sambil menunggu frame pertama video lalu terus me-seek ulang ke awal, sehingga pratinjau
 * mengulang ±0,2 dtk tanpa henti.
 */
test("pratinjau editor di WebKit diputar maju dari frame 0, tidak mengulang", async ({
  page,
  request,
}) => {
  const { projects } = (await (await request.get("/api/projects")).json()) as {
    projects: ProjectListItem[];
  };
  const project = projects.find(
    (p) => p.name === VIDEOS.id.file.replace(/\.mp4$/, ""),
  );
  expect(project, "proyek dari suite utama").toBeDefined();
  const { clips } = (await (
    await request.get(`/api/projects/${project!.id}/clips`)
  ).json()) as { clips: Clip[] };
  expect(clips.length, "klip dari suite utama").toBeGreaterThan(0);
  const clip = clips.reduce((a, b) =>
    b.endMs - b.startMs > a.endMs - a.startMs ? b : a,
  );
  // Sampel 2 dtk perlu klip yang cukup panjang.
  expect(clip.endMs - clip.startMs).toBeGreaterThan(3_000);
  await page.goto(`/projects/${project!.id}/clips/${clip.id}/edit`);

  const video = page.locator("video").first();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Putar" }).click();

  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(200);
    times.push(await video.evaluate((v: HTMLVideoElement) => v.currentTime));
  }
  const backwards = times.slice(1).filter((t, i) => t < times[i]! - 0.05);
  expect(backwards, `currentTime: ${times.join(", ")}`).toEqual([]);
  expect(times.at(-1)! - times[0]!).toBeGreaterThan(1);
});
