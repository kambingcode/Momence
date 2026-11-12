import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import type { Clip } from "@/modules/clips/application";
import type { ProjectListItem } from "@/modules/projects/application";
import type { Transcript } from "@/modules/transcript/application";
import { e2eDataDir, fixturesDir } from "./global-setup";
import { VIDEOS, type VideoLanguage, videoPath } from "./videos";

/**
 * Alur utama dengan web + worker sungguhan (Whisper, ffmpeg, MediaPipe, Remotion) pada data
 * terpisah; hanya Gemini API yang diganti server palsu (lihat fake-gemini.ts).
 */
test.describe.configure({ mode: "serial" });

const PIPELINE_TIMEOUT = 5 * 60_000;

function projectName(language: VideoLanguage): string {
  return VIDEOS[language].file.replace(/\.mp4$/, "");
}

async function findProject(
  request: APIRequestContext,
  language: VideoLanguage,
): Promise<ProjectListItem | undefined> {
  const response = await request.get("/api/projects");
  const { projects } = (await response.json()) as {
    projects: ProjectListItem[];
  };
  return projects.find((p) => p.name === projectName(language));
}

/** Tunggu job `type` proyek selesai; job gagal langsung menggagalkan tes dengan pesannya. */
async function waitForJob(
  request: APIRequestContext,
  language: VideoLanguage,
  type: string,
): Promise<ProjectListItem> {
  let project: ProjectListItem | undefined;
  await expect
    .poll(
      async () => {
        project = await findProject(request, language);
        const job = project?.jobs.find((j) => j.type === type);
        if (job?.status === "failed")
          throw new Error(`Job ${type} gagal: ${job.error}`);
        return job?.status;
      },
      { timeout: PIPELINE_TIMEOUT, intervals: [1_000] },
    )
    .toBe("done");
  return project!;
}

async function upload(page: Page, language: VideoLanguage, clipFocus?: string) {
  await page.goto("/");
  if (clipFocus) {
    // Kartu Fokus klip → dialog; nilainya berlaku untuk upload berikutnya.
    await page.getByRole("button", { name: /Fokus klip/ }).click();
    const dialog = page.getByRole("dialog", { name: "Fokus klip" });
    await dialog.getByRole("textbox", { name: /Fokus klip/ }).fill(clipFocus);
    await dialog.getByRole("button", { name: "Selesai" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: /Fokus klip/ }),
    ).toContainText(clipFocus);
  }
  await page
    .locator('input[type="file"]')
    .setInputFiles(videoPath(fixturesDir(), language));
  await expect(
    page.getByRole("link", { name: projectName(language) }),
  ).toBeVisible();
}

async function transcriptOf(
  request: APIRequestContext,
  projectId: string,
): Promise<Transcript> {
  const response = await request.get(`/api/projects/${projectId}/transcript`);
  return ((await response.json()) as { transcript: Transcript }).transcript;
}

function ffprobe(file: string): {
  width: number;
  height: number;
  duration: number;
} {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    file,
  ]).toString();
  const json = JSON.parse(out) as {
    streams: { width: number; height: number }[];
    format: { duration: string };
  };
  return { ...json.streams[0]!, duration: Number(json.format.duration) };
}

/**
 * Jumlah piksel hampir hitam di kiri-tengah frame MP4 pada detik `atS` (x 15–45%, y 40–60%:
 * awal teks yang berpusat di tengah). Latar video uji di area itu hanya bilah berwarna — kotak
 * penghitung hitam pola uji ada di kanan-tengah — jadi piksel hitam berasal dari teks custom hitam.
 */
function darkPixelsLeftOfCenter(file: string, atS: number): number {
  const rgb = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(atS),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "crop=iw*0.3:ih*0.2:iw*0.15:ih*0.4",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  let dark = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3)
    if (Math.max(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!) < 60) dark += 1;
  return dark;
}

const plain = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

test("Bahasa Indonesia: upload → transkrip → klip berskor → editor → export MP4", async ({
  page,
  request,
}) => {
  await upload(page, "id");
  const project = await waitForJob(request, "id", "discover");

  // Transkrip berbahasa Indonesia dengan cap waktu per kata & filler "eh" ditandai.
  const transcript = await transcriptOf(request, project.id);
  expect(transcript.language).toBe("id");
  const words = transcript.tokens.filter((t) => t.type !== "pause");
  expect(words.length).toBeGreaterThan(60);
  expect(words.every((t) => t.endMs > t.startMs)).toBe(true);
  expect(
    transcript.tokens.some(
      (t) => t.type === "filler" && plain(t.text) === "eh",
    ),
  ).toBe(true);

  // Menu "…" kartu proyek → transkrip.
  await page
    .getByRole("button", { name: `Menu proyek ${projectName("id")}` })
    .click();
  await page.getByRole("menuitem", { name: "Buka transkrip" }).click();
  await expect(page.getByText("Halo", { exact: false }).first()).toBeVisible();

  // Kepala proyek: remah roti + tab Klip | Transkrip (tab aktif bertanda aria-current).
  await expect(
    page.getByRole("navigation", { name: "Remah roti" }),
  ).toContainText(projectName("id"));
  const tabs = page.getByRole("navigation", { name: "Bagian proyek" });
  await expect(tabs.getByRole("link", { name: "Transkrip" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Dua klip dari server Gemini palsu, skor 60–99 berbasis peringkat.
  await tabs.getByRole("link", { name: "Klip" }).click();
  await expect(tabs.getByRole("link", { name: "Klip" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const clipsResponse = await request.get(`/api/projects/${project.id}/clips`);
  const { clips } = (await clipsResponse.json()) as { clips: Clip[] };
  expect(clips).toHaveLength(2);
  expect(clips.map((c) => c.rank)).toEqual([1, 2]);
  for (const clip of clips) {
    expect(clip.score).toBeGreaterThanOrEqual(60);
    expect(clip.score).toBeLessThanOrEqual(99);
  }
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(2);
  const clip = clips[0]!;
  await page.getByRole("link", { name: "Edit" }).first().click();

  // Editor: potong kata ketiga (Delete), Simpan, muat ulang → tetap terpotong (server).
  const editor = page.getByRole("textbox", { name: /Transkrip klip/ });
  const target = editor.locator('[data-index="2"]');
  await expect(target).toBeVisible();
  const clipTokens = transcript.tokens.filter(
    (t) => t.startMs >= clip.startMs && t.endMs <= clip.endMs,
  );
  await target.click({ position: { x: 1, y: 4 } });
  await page.keyboard.press("Delete");
  await expect(target).toHaveAttribute("data-removed", "true");
  await expect(page.getByText("Belum disimpan")).toBeVisible();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Tersimpan")).toBeVisible();
  await page.reload();
  await expect(editor.locator('[data-index="2"]')).toHaveAttribute(
    "data-removed",
    "true",
  );
  await expect(page.getByText("Tersimpan")).toBeVisible();

  // Pratinjau Remotion memuat caption kata pertama klip.
  const firstWord = plain(clipTokens.find((t) => t.type !== "pause")!.text);
  await expect
    .poll(async () =>
      plain((await page.locator(".bg-black").first().innerText()) ?? ""),
    )
    .toContain(firstWord);

  // Space memutar/menjeda pratinjau walau fokus di panel transkrip.
  await editor.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Jeda", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Putar", exact: true }),
  ).toBeVisible();

  // Export → render worker → unduh → 1080×1920, durasi = klip − bagian yang dipotong.
  // Export ditolak selama analisis wajah (reframe, diantre setelah discover) masih berjalan.
  await waitForJob(request, "id", "reframe");
  await page.getByRole("button", { name: "Export" }).click();
  const download = page.getByRole("link", { name: "Unduh MP4" });
  await expect(download).toBeVisible({ timeout: PIPELINE_TIMEOUT });
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    download.click(),
  ]);
  const saved = path.join(e2eDataDir(), "unduhan.mp4");
  await file.saveAs(saved);
  const removed = clipTokens.filter((t) => t.type !== "pause")[2]!;
  const probe = ffprobe(saved);
  expect({ width: probe.width, height: probe.height }).toEqual({
    width: 1080,
    height: 1920,
  });
  const clipS = (clip.endMs - clip.startMs) / 1000;
  const expectedS = clipS - (removed.endMs - removed.startMs) / 1000;
  expect(probe.duration).toBeLessThan(clipS - 0.1);
  expect(Math.abs(probe.duration - expectedS)).toBeLessThan(0.35);
});

test("English: transkrip berbahasa Inggris", async ({ page, request }) => {
  // Fokus klip diisi sebelum upload: dipakai tes "cari ulang klip" di bawah.
  await upload(page, "en", "momen lucu");
  const project = await waitForJob(request, "en", "transcribe");
  const transcript = await transcriptOf(request, project.id);
  expect(transcript.language).toBe("en");
  const text = transcript.tokens.map((t) => plain(t.text)).join(" ");
  expect(text).toContain("welcome");
  expect(text).toContain("consistent");
});

test("dashboard: thumbnail, status Selesai, cari judul, toggle tampilan", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  await waitForJob(request, "id", "reframe");
  await page.goto("/");

  // Grid kartu = tampilan bawaan: seluruh kartu menaut ke halaman klip, lencana jumlah klip.
  const card = page.getByRole("article").filter({ hasText: projectName("id") });
  await expect(
    card.getByRole("link", { name: projectName("id") }),
  ).toHaveAttribute("href", `/projects/${project.id}/clips`);
  await expect(card.getByText("2 klip").first()).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);

  // Thumbnail dibuat worker saat ingest dan benar-benar termuat (bukan gradien cadangan).
  const thumbnail = card.locator("img");
  await expect(thumbnail).toHaveCount(1);
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const thumbResponse = await request.get(
    `/api/projects/${project.id}/thumbnail`,
  );
  expect(thumbResponse.status()).toBe(200);
  expect(thumbResponse.headers()["content-type"]).toBe("image/jpeg");

  // Kartu ⇄ tabel; pilihan bertahan setelah muat ulang.
  await page.getByRole("button", { name: "Tampilan tabel" }).click();
  const row = page.getByRole("row").filter({ hasText: projectName("id") });
  await expect(row.getByText("Selesai", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "Lihat klip" })).toBeVisible();
  await expect(
    row.getByRole("link", { name: "Lihat transkrip" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tampilan tabel" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table")).toBeVisible();

  // Cari judul (tanpa membedakan huruf): hanya proyek yang cocok yang tersisa.
  const search = page.getByRole("searchbox", { name: "Cari proyek" });
  await search.fill(projectName("id").toUpperCase());
  await expect(page.getByRole("link", { name: projectName("id") })).toHaveCount(
    1,
  );
  await expect(page.getByText(/Menampilkan 1 dari \d+ proyek/)).toBeVisible();
  await search.fill("tidak-ada-judul-seperti-ini");
  await expect(page.getByText("Tidak ada proyek yang cocok")).toBeVisible();
  await page.getByRole("button", { name: "Hapus pencarian" }).last().click();
  await expect(page.getByText("Tidak ada proyek yang cocok")).toBeHidden();
  await page.getByRole("button", { name: "Tampilan kartu" }).click();
  await expect(page.getByRole("table")).toHaveCount(0);

  // Sidebar: item halaman aktif bertanda aria-current; berpindah ke Pengaturan & kembali.
  const menu = page.getByRole("navigation", { name: "Menu" });
  await expect(menu.getByRole("link", { name: "Proyek" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await menu.getByRole("link", { name: "Pengaturan" }).click();
  await expect(
    page.getByRole("heading", { name: "Pengaturan", level: 1 }),
  ).toBeVisible();
  await expect(menu.getByRole("link", { name: "Pengaturan" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await menu.getByRole("link", { name: "Proyek" }).click();
  await expect(
    page.getByRole("heading", { name: "Mau bikin klip apa hari ini?" }),
  ).toBeVisible();
});

test("beranda: tempel link membuka dialog impor yang sudah terisi", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mau bikin klip apa hari ini?" }),
  ).toBeVisible();
  const paste = (text: string) =>
    page.evaluate((value) => {
      const data = new DataTransfer();
      data.setData("text/plain", value);
      document.body.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
      );
    }, text);
  const dialog = page.getByRole("dialog", { name: "Impor dari link" });

  // Teks biasa diabaikan; link video membuka dialog terisi.
  await paste("halo dunia");
  await expect(dialog).toHaveCount(0);
  await paste("https://youtu.be/dQw4w9WgXcQ");
  await expect(
    dialog.getByRole("textbox", { name: /Link YouTube/ }),
  ).toHaveValue("https://youtu.be/dQw4w9WgXcQ");
  // Batal menutup tanpa membuat proyek.
  await dialog.getByRole("button", { name: "Batal" }).click();
  await expect(dialog).toBeHidden();
});

test("editor: tab panel & Speech cleanup (filler) menghapus dan bisa diurungkan", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  const transcript = await transcriptOf(request, project.id);
  const clip = clips.find((c) =>
    transcript.tokens.some(
      (t) =>
        t.type === "filler" && t.startMs >= c.startMs && t.endMs <= c.endMs,
    ),
  );
  expect(clip, "klip berisi filler (fixture)").toBeDefined();
  await page.goto(`/projects/${project.id}/clips/${clip!.id}/edit`);

  // Tab: Rapikan aktif lebih dulu; berpindah ke Caption menampilkan panelnya.
  await expect(page.getByRole("tab", { name: "Rapikan" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Caption" }).click();
  await expect(page.getByRole("tabpanel", { name: "Caption" })).toBeVisible();
  // Rail panel vertikal: ↓/↑ berpindah panel.
  await page.getByRole("tab", { name: "Caption" }).press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Reframe" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Reframe" }).press("ArrowUp");
  await expect(page.getByRole("tab", { name: "Caption" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Rapikan" }).click();

  // Slider durasi jeda: Home = batas bawah, ArrowRight menaikkan.
  const threshold = page.getByRole("slider", { name: "Durasi jeda minimum" });
  await threshold.focus();
  await page.keyboard.press("Home");
  const min = Number(await threshold.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  expect(Number(await threshold.getAttribute("aria-valuenow"))).toBeGreaterThan(
    min,
  );

  // Filler: ditemukan → Hapus semua memotong semuanya → Urungkan memulihkan.
  const filler = page.getByRole("region", { name: "Filler" });
  const found = filler.getByText(/\d+ ditemukan/);
  const count = Number((await found.innerText()).split(" ")[0]);
  expect(count).toBeGreaterThan(0);
  const editor = page.getByRole("textbox", { name: /Transkrip klip/ });

  // Navigator menyorot temuan di teks: seleksi + label jenis & urutannya (bukan seleksi biasa).
  await filler.getByRole("button", { name: "filler berikutnya" }).click();
  await expect(editor.getByText(`Kata pengisi · 1 / ${count}`)).toBeVisible();
  // Memilih kata lain di teks melepas sorotan temuan.
  await editor.locator('[data-index="0"]').click({ position: { x: 1, y: 4 } });
  await expect(editor.getByText(/Kata pengisi · /)).toHaveCount(0);

  // Seleksi kata → toolbar potong mengambang dengan ringkasannya; klik = memotong.
  await editor
    .locator('[data-index="1"]')
    .click({ position: { x: 1, y: 4 }, modifiers: ["Shift"] });
  const cutBar = page.getByRole("dialog", { name: "Potong seleksi" });
  await expect(cutBar).toContainText("1 kata");
  await cutBar.getByRole("button", { name: /Potong/ }).click();
  await expect(editor.locator('[data-index="0"]')).toHaveAttribute(
    "data-removed",
    "true",
  );
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(editor.locator('[data-index="0"]')).not.toHaveAttribute(
    "data-removed",
    "true",
  );

  await filler.getByRole("button", { name: `Hapus semua (${count})` }).click();
  await expect(found).toHaveText("0 ditemukan");
  await expect(editor.locator("[data-removed]").first()).toBeVisible();
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(found).toHaveText(`${count} ditemukan`);
});

test("editor: pintasan keyboard & dialog draft lokal", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  await page.goto(`/projects/${project.id}/clips/${clips[0]!.id}/edit`);
  const editor = page.getByRole("textbox", { name: /Transkrip klip/ });
  const first = editor.locator('[data-index="0"]');
  await expect(first).toBeVisible();

  // "?" membuka daftar pintasan walau fokus di transkrip; Esc menutup; tombol header juga membuka.
  await editor.focus();
  await page.keyboard.press("?");
  const shortcuts = page.getByRole("dialog", { name: "Pintasan keyboard" });
  await expect(shortcuts).toContainText("Putar / jeda");
  await expect(shortcuts).toContainText("Potong seleksi");
  await page.keyboard.press("Escape");
  await expect(shortcuts).toHaveCount(0);
  await page.getByRole("button", { name: "Pintasan keyboard" }).click();
  await expect(shortcuts).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shortcuts).toHaveCount(0);

  // Editan belum disimpan → draft lokal → muat ulang menawarkannya; dialog tak bisa ditutup dengan Esc.
  await first.click({ position: { x: 1, y: 4 } });
  await page.keyboard.press("Delete");
  await expect(first).toHaveAttribute("data-removed", "true");
  await page.waitForTimeout(1500);
  await page.reload();
  const draft = page.getByRole("dialog", {
    name: "Lanjutkan editan yang belum disimpan?",
  });
  await expect(draft).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: "Lanjutkan editan" }).click();
  await expect(draft).toHaveCount(0);
  await expect(first).toHaveAttribute("data-removed", "true");
  await expect(page.getByText("Belum disimpan")).toBeVisible();

  // Buang draft → kembali ke versi tersimpan (tanpa potongan).
  await page.reload();
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: "Buang draft" }).click();
  await expect(draft).toHaveCount(0);
  await expect(first).not.toHaveAttribute("data-removed", "true");
});

test("editor: panel Caption mengubah gaya & bisa diurungkan", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  await page.goto(`/projects/${project.id}/clips/${clips[1]!.id}/edit`);
  await page.getByRole("tab", { name: "Caption" }).click();
  const styles = page.getByRole("radiogroup", { name: "Gaya animasi" });
  await expect(
    styles.getByRole("radio", { name: /Karaoke fill/ }),
  ).toBeChecked();

  // Preset diganti → seluruh gaya mengikuti bawaannya; "Belum disimpan" muncul.
  await styles.getByRole("radio", { name: /Pop/ }).click();
  await expect(styles.getByRole("radio", { name: /Pop/ })).toBeChecked();
  await expect(page.getByText("Belum disimpan")).toBeVisible();

  // Slider ukuran (←/→), posisi (radiogroup) & swatch warna menulis ke state yang sama.
  const size = page.getByRole("slider", { name: "Ukuran caption" });
  const before = Number(await size.getAttribute("aria-valuenow"));
  await size.focus();
  await page.keyboard.press("ArrowRight");
  expect(Number(await size.getAttribute("aria-valuenow"))).toBeGreaterThan(
    before,
  );
  await page.getByRole("radio", { name: "Atas" }).click();
  await expect(page.getByRole("radio", { name: "Atas" })).toBeChecked();
  const accent = page.getByRole("radiogroup", { name: "Kata diucapkan" });
  await accent.getByRole("radio", { name: "#f472b6" }).click();
  await expect(accent.getByRole("radio", { name: "#f472b6" })).toBeChecked();

  // Kembalikan gaya preset menghapus semua penyesuaian.
  await page.getByRole("button", { name: "Kembalikan gaya preset" }).click();
  await expect(page.getByRole("radio", { name: "Bawah" })).toBeChecked();
  await expect(
    accent.getByRole("radio", { name: "#f472b6" }),
  ).not.toBeChecked();
});

test("editor: panel Reframe mengubah rasio & tata letak", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  await page.goto(`/projects/${project.id}/clips/${clips[1]!.id}/edit`);
  await page.getByRole("tab", { name: "Reframe" }).click();
  const ratio = page.getByRole("radiogroup", { name: "Rasio" });
  await expect(ratio.getByRole("radio", { name: /9:16/ })).toBeChecked();

  // Rasio → keterangan pratinjau & status "Belum disimpan" mengikuti.
  await ratio.getByRole("radio", { name: /1:1/ }).click();
  await expect(ratio.getByRole("radio", { name: /1:1/ })).toBeChecked();
  await expect(page.getByText(/^1:1 · Isi/)).toBeVisible();
  await expect(page.getByText("Belum disimpan")).toBeVisible();

  // Layout Utuh mematikan "Ikuti wajah" (tidak ada yang dipotong).
  const follow = page.getByRole("checkbox", { name: /Ikuti wajah/ });
  await page.getByRole("radio", { name: "Utuh" }).click();
  await expect(follow).toBeDisabled();
  await page.getByRole("radio", { name: "Isi", exact: true }).click();
  // Tiga perubahan (rasio, Utuh, Isi) → tiga kali urungkan kembali ke 9:16.
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(ratio.getByRole("radio", { name: /9:16/ })).toBeChecked();
});

test("editor: panel B-roll memasang, mengganti & menghapus video stok", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  const clip = clips[1]!;
  // Rencana & pencarian Pixabay dipalsukan (tanpa Gemini/Pixabay asli).
  await page.route("**/api/clips/*/broll-plan", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        job: null,
        slots: [
          {
            startMs: clip.startMs + 2000,
            endMs: clip.startMs + 5000,
            sentence: 1,
            text: "Kalimat contoh untuk B-roll",
            intent: "Tim kecil bekerja di satu meja",
            keywords: ["small team", "startup desk"],
          },
        ],
      },
    }),
  );
  const video = (id: number, author: string) => ({
    id,
    width: 1080,
    height: 1920,
    durationMs: 8000 + id,
    pageUrl: `https://pixabay.com/videos/id-${id}/`,
    thumbnailUrl: "https://cdn.pixabay.com/x.jpg",
    author,
    url: "https://cdn.pixabay.com/x.mp4",
    previewUrl: "https://cdn.pixabay.com/x-small.mp4",
  });
  await page.route("**/api/broll/search**", (route) =>
    route.fulfill({
      json: {
        videos: [video(1, "kreator_satu"), video(2, "kreator_dua")],
        page: 1,
        hasMore: false,
      },
    }),
  );
  await page.goto(`/projects/${project.id}/clips/${clip.id}/edit`);
  await page.getByRole("tab", { name: "B-roll" }).click();
  const panel = page.getByRole("region", { name: "B-roll" });

  // Slot dari rencana: chip waktu, judul, kutipan, kata kunci; pilih video → terpasang + atribusi.
  const slot = panel.getByRole("listitem").filter({ hasText: "Tim kecil" });
  await expect(slot).toContainText("“Kalimat contoh untuk B-roll”");
  await expect(slot).toContainText("small team");
  await slot.getByRole("button", { name: "Pilih video" }).click();
  await expect(panel.getByLabel("Kata kunci video stok")).toHaveValue(
    "small team",
  );
  await panel
    .getByRole("button", { name: /Pakai video oleh kreator_satu/ })
    .click();
  await expect(slot).toContainText("Video oleh kreator_satu di Pixabay");
  await expect(page.getByText("Belum disimpan")).toBeVisible();

  // Ganti memakai video lain; hapus melepasnya (slot tetap, kembali "Pilih video").
  await slot.getByRole("button", { name: "Ganti" }).click();
  await panel
    .getByRole("button", { name: /Pakai video oleh kreator_dua/ })
    .click();
  await expect(slot).toContainText("Video oleh kreator_dua di Pixabay");
  await slot.getByRole("button", { name: "Hapus B-roll" }).click();
  await expect(slot.getByRole("button", { name: "Pilih video" })).toBeVisible();
});

test("editor: peta klip menampilkan potongan & klik memindahkan pratinjau", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  await page.goto(`/projects/${project.id}/clips/${clips[1]!.id}/edit`);
  const map = page.getByTestId("clip-map");
  await expect(map).toBeVisible();
  await expect(map.locator('[data-kind="cut"]')).toHaveCount(0);

  // Potong kata → arsiran muncul di peta; Urungkan menghapusnya.
  const editor = page.getByRole("textbox", { name: /Transkrip klip/ });
  await editor.locator('[data-index="1"]').click({ position: { x: 1, y: 4 } });
  await page.keyboard.press("Delete");
  await expect(map.locator('[data-kind="cut"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(map.locator('[data-kind="cut"]')).toHaveCount(0);

  // Klik di tengah peta → pratinjau & kursor transkrip pindah (playhead mengikuti).
  const box = (await map.boundingBox())!;
  await expect(map).toHaveAttribute("aria-valuenow", "0");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await expect
    .poll(async () => Number(await map.getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  const left = await page
    .getByTestId("clip-map-playhead")
    .evaluate((el) => (el as HTMLElement).style.left);
  expect(parseFloat(left)).toBeGreaterThan(30);
  expect(parseFloat(left)).toBeLessThan(70);

  // Keyboard: End → akhir klip.
  await map.focus();
  await page.keyboard.press("End");
  await expect
    .poll(async () =>
      parseFloat(
        await page
          .getByTestId("clip-map-playhead")
          .evaluate((el) => (el as HTMLElement).style.left),
      ),
    )
    .toBeGreaterThan(90);
});

test("editor: teks custom ditambah, diseret, diatur di tab Teks & dihapus", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  await page.goto(`/projects/${project.id}/clips/${clips[1]!.id}/edit`);
  const preview = page.getByRole("region", { name: "Pratinjau" });
  const drawn = preview.locator("[data-text-overlay]");
  await expect(drawn).toHaveCount(0);

  // Tab Teks: kosong → Tambah → teks bawaan digambar komposisi & kotak pilihnya muncul.
  await page.getByRole("tab", { name: "Teks" }).click();
  const panel = page.getByRole("region", { name: "Pengaturan teks" });
  await expect(panel.getByText("Belum ada teks.")).toBeVisible();
  await panel.getByRole("button", { name: "Tambah teks" }).click();
  await expect(drawn).toHaveText("Teks baru");
  const box = preview.getByRole("button", { name: /^Teks “Teks baru”/ });
  await expect(box).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Belum disimpan")).toBeVisible();
  const start = (await box.boundingBox())!;
  const drawnStart = (await drawn.boundingBox())!;
  // Kotak pilih menutup teks yang digambar (ukuran diukur dari Player).
  expect(Math.abs(start.width - drawnStart.width)).toBeLessThan(2);
  expect(Math.abs(start.x - drawnStart.x)).toBeLessThan(2);

  // Seret 40 px ke kanan, 60 px ke bawah (beberapa langkah) → teks ikut pindah.
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 4; i += 1)
    await page.mouse.move(
      start.x + start.width / 2 + i * 10,
      start.y + start.height / 2 + i * 15,
    );
  await page.mouse.up();
  await expect
    .poll(async () => (await drawn.boundingBox())!.x - drawnStart.x)
    .toBeGreaterThan(35);
  // Satu seretan = satu langkah undo.
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect
    .poll(async () => Math.abs((await drawn.boundingBox())!.x - drawnStart.x))
    .toBeLessThan(1);
  await expect(drawn).toHaveText("Teks baru");

  // Klik ganda → kolom isi; aksen dipertahankan; Enter = selesai.
  await box.dblclick();
  const field = preview.getByRole("textbox", { name: "Isi teks" });
  await field.fill("Não é só isso, né?");
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(drawn).toHaveText("Não é só isso, né?");
  const renamed = preview.getByRole("button", {
    name: /^Teks “Não é só isso, né\?”/,
  });
  await expect(renamed).toBeVisible();

  // Tab Teks: isi, font, ukuran & warna menulis ke teks terpilih.
  const layers = panel.getByRole("list", { name: "Lapisan teks" });
  await expect(layers.getByRole("listitem")).toHaveCount(1);
  await expect(layers.getByRole("button", { pressed: true })).toContainText(
    "Não é só isso, né?",
  );
  await panel.getByRole("textbox", { name: "Isi teks" }).fill("Judul klip");
  await expect(drawn).toHaveText("Judul klip");
  await panel.getByRole("combobox", { name: "Font" }).selectOption("bangers");
  await expect
    .poll(() => drawn.evaluate((el) => getComputedStyle(el).fontFamily))
    .toContain("Bangers");
  const width = (await drawn.boundingBox())!.width;
  const size = panel.getByRole("slider", { name: "Ukuran teks" });
  await size.focus();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await drawn.boundingBox())!.width)
    .toBeGreaterThan(width);
  await panel
    .getByRole("radiogroup", { name: "Warna teks" })
    .getByRole("radio", { name: "#facc15" })
    .click();
  await expect(drawn).toHaveCSS("color", "rgb(250, 204, 21)");

  // Teks kedua di depan; urutan tumpuk bisa diubah dari daftar (paling depan di atas).
  await panel.getByRole("button", { name: "Tambah teks" }).click();
  await expect(layers.getByRole("listitem")).toHaveCount(2);
  await expect(layers.getByRole("listitem").first()).toContainText("Teks baru");
  await panel.getByRole("button", { name: "Ke belakang: Teks baru" }).click();
  await expect(layers.getByRole("listitem").first()).toContainText(
    "Judul klip",
  );
  await panel.getByRole("button", { name: "Hapus teks: Teks baru" }).click();
  await expect(layers.getByRole("listitem")).toHaveCount(1);
  const renamedAgain = preview.getByRole("button", {
    name: /^Teks “Judul klip”/,
  });

  // Peta klip: batang teks; seret badan = geser rentang, seret tepi kanan = ubah akhir.
  const texts = page.getByTestId("clip-map-texts");
  const bar = texts.getByRole("button", { name: /^Teks “Judul klip”/ });
  await expect(bar).toHaveCount(1);
  const chip = layers.getByRole("listitem").first();
  const chipBefore = await chip.textContent();
  const track = (await texts.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  const y = barBox.y + barBox.height / 2;
  await page.mouse.move(barBox.x + barBox.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 4; i += 1)
    await page.mouse.move(
      barBox.x + barBox.width / 2 + (track.width * 0.2 * i) / 4,
      y,
    );
  await page.mouse.up();
  await expect
    .poll(async () => (await bar.boundingBox())!.x - barBox.x)
    .toBeGreaterThan(track.width * 0.15);
  await expect(chip).not.toHaveText(chipBefore!);
  const moved = (await bar.boundingBox())!;
  await page.mouse.move(moved.x + moved.width - 2, y);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width + track.width * 0.1, y, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await bar.boundingBox())!.width - moved.width)
    .toBeGreaterThan(track.width * 0.05);
  // Tiap seretan satu langkah undo: dua kali Urungkan → kembali ke rentang awal.
  await page.getByRole("button", { name: "Urungkan" }).click();
  await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(chip).toHaveText(chipBefore!);

  // Batas 8 teks: tombol Tambah nonaktif + keterangan; semua bisa diurungkan.
  for (let i = 1; i < 8; i += 1)
    await panel.getByRole("button", { name: "Tambah teks" }).click();
  await expect(layers.getByRole("listitem")).toHaveCount(8);
  await expect(
    panel.getByRole("button", { name: "Tambah teks" }),
  ).toBeDisabled();
  await expect(panel.getByText("Maksimal 8 teks per klip.")).toBeVisible();
  for (let i = 1; i < 8; i += 1)
    await page.getByRole("button", { name: "Urungkan" }).click();
  await expect(layers.getByRole("listitem")).toHaveCount(1);

  // Panah menggeser (⇧ = 5%); Delete menghapus.
  await renamedAgain.focus();
  const before = (await drawn.boundingBox())!.y;
  await page.keyboard.press("Shift+ArrowUp");
  await expect
    .poll(async () => before - (await drawn.boundingBox())!.y)
    .toBeGreaterThan(5);
  await page.keyboard.press("Delete");
  await expect(drawn).toHaveCount(0);
  await expect(renamedAgain).toHaveCount(0);
  await expect(panel.getByText("Belum ada teks.")).toBeVisible();
});

test("export: teks custom tersimpan & tergambar di MP4 pada tiga rasio", async ({
  page,
  request,
}) => {
  test.setTimeout(PIPELINE_TIMEOUT);
  const project = await waitForJob(request, "id", "discover");
  await waitForJob(request, "id", "reframe");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  const clip = clips[1]!;
  await page.goto(`/projects/${project.id}/clips/${clip.id}/edit`);

  // Teks hitam besar di tengah, 0–3 dtk pertama klip (posisi pratinjau di awal).
  await page.getByRole("tab", { name: "Teks" }).click();
  const panel = page.getByRole("region", { name: "Pengaturan teks" });
  await panel.getByRole("button", { name: "Tambah teks" }).click();
  await panel
    .getByRole("textbox", { name: "Isi teks" })
    .fill("Não é só isso, né?");
  await panel
    .getByRole("radiogroup", { name: "Warna teks" })
    .getByRole("radio", { name: "#000000" })
    .click();
  const size = panel.getByRole("slider", { name: "Ukuran teks" });
  await size.focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("ArrowRight");

  // Simpan → muat ulang → teks tetap ada (dari server).
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Tersimpan")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Teks" }).click();
  const layers = page.getByRole("list", { name: "Lapisan teks" });
  await expect(layers.getByRole("listitem")).toHaveCount(1);
  await expect(layers).toContainText("Não é só isso, né?");
  const preview = page.getByRole("region", { name: "Pratinjau" });
  await expect(preview.locator("[data-text-overlay]")).toHaveText(
    "Não é só isso, né?",
  );

  const download = page.getByRole("link", { name: "Unduh MP4" });
  let previousHref: string | null = null;
  const sizes = {
    "9:16": [1080, 1920],
    "1:1": [1080, 1080],
    "16:9": [1920, 1080],
  };
  for (const ratio of ["9:16", "1:1", "16:9"] as const) {
    if (ratio !== "9:16") {
      await page.getByRole("tab", { name: "Reframe" }).click();
      await page
        .getByRole("radiogroup", { name: "Rasio" })
        .getByRole("radio", { name: new RegExp(ratio) })
        .click();
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByText("Tersimpan")).toBeVisible();
    }
    await page
      .getByRole("button", { name: /^(Export MP4|Render ulang)$/ })
      .click();
    await expect
      .poll(
        async () =>
          (await download.count()) > 0 ? download.getAttribute("href") : null,
        { timeout: PIPELINE_TIMEOUT, intervals: [1_000] },
      )
      .not.toBe(previousHref);
    previousHref = await download.getAttribute("href");
    const response = await request.get(previousHref!);
    expect(response.ok()).toBe(true);
    const saved = path.join(
      e2eDataDir(),
      `teks-${ratio.replace(":", "x")}.mp4`,
    );
    writeFileSync(saved, await response.body());
    const probe = ffprobe(saved);
    expect([probe.width, probe.height]).toEqual(sizes[ratio]);
    // Teks tampil 0–3 dtk: banyak piksel hitam; setelahnya hampir tidak ada.
    const withText = darkPixelsLeftOfCenter(saved, 1.5);
    const withoutText = darkPixelsLeftOfCenter(saved, 6);
    expect(withText).toBeGreaterThan(1_000);
    expect(withoutText).toBeLessThan(withText / 10);
  }
});

test("fokus klip: terbawa dari upload ke discover, lalu Cari ulang klip mengubahnya", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "en", "discover");
  await waitForJob(request, "en", "reframe");
  const titles = async () => {
    const response = await request.get(`/api/projects/${project.id}/clips`);
    const { clips } = (await response.json()) as { clips: Clip[] };
    return clips.map((c) => c.title);
  };

  // Fokus dari upload sampai ke Gemini palsu: semua judul berawalan "Fokus: ".
  const initial = await titles();
  expect(initial).toHaveLength(1);
  expect(initial.every((t) => t.startsWith("Fokus: "))).toBe(true);
  await page.goto(`/projects/${project.id}/clips`);
  await expect(page.getByText("Fokus: momen lucu")).toBeVisible();

  // Cari ulang tanpa fokus: dialog terisi fokus lama, dikosongkan, klip diganti.
  await page.getByRole("button", { name: "Cari ulang klip" }).click();
  const dialog = page.getByRole("dialog", { name: "Cari ulang klip" });
  const field = dialog.getByRole("textbox", { name: /Fokus klip/ });
  await expect(field).toHaveValue("momen lucu");
  await field.fill("");
  await dialog.getByRole("button", { name: "Cari ulang", exact: true }).click();
  await expect(dialog).toBeHidden();

  await waitForJob(request, "en", "discover");
  await waitForJob(request, "en", "reframe");
  await expect(page.getByText("Tanpa fokus klip")).toBeVisible();
  const afterwards = await titles();
  expect(afterwards.length).toBeGreaterThanOrEqual(1);
  expect(afterwards.some((t) => t.startsWith("Fokus: "))).toBe(false);

  // Fokus 501 karakter ditolak server (batas dijaga di API, bukan hanya di kolom).
  const tooLong = await request.post(`/api/projects/${project.id}/discover`, {
    data: { clipFocus: "a".repeat(501) },
  });
  expect(tooLong.status()).toBe(400);
  // Proyek yang tidak ada → 404.
  const missing = await request.post("/api/projects/tidak-ada/discover", {
    data: { clipFocus: null },
  });
  expect(missing.status()).toBe(404);
});

test("caption & hashtag: dialog di kartu klip menulis, merapikan, dan bisa dibuat ulang", async ({
  page,
  request,
}) => {
  const project = await waitForJob(request, "id", "discover");
  const { clips } = (await (
    await request.get(`/api/projects/${project.id}/clips`)
  ).json()) as { clips: Clip[] };
  const clip = clips[0]!;

  // API: body tidak valid → 400, klip tidak ada → 404, klip ada tapi belum pernah dibuat → missing.
  const endpoint = `/api/clips/${clip.id}/post-copy`;
  expect(
    (await request.post(endpoint, { data: { platform: "myspace" } })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/clips/tidak-ada/post-copy", {
        data: { platform: "tiktok", language: "auto" },
      })
    ).status(),
  ).toBe(404);
  expect((await request.get("/api/clips/tidak-ada/post-copy")).status()).toBe(
    404,
  );
  expect(
    ((await (await request.get(endpoint)).json()) as { status: string }).status,
  ).toBe("missing");

  await page.goto(`/projects/${project.id}/clips`);
  await page.getByRole("button", { name: "Caption" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Caption & hashtag").first()).toBeVisible();

  // Reels + English: platform & bahasa sampai ke Gemini palsu lewat job sungguhan.
  await dialog.getByRole("radio", { name: "Reels" }).click();
  await dialog.getByRole("radio", { name: "English" }).click();
  await dialog.getByRole("button", { name: "Buat caption" }).click();
  await expect(dialog.getByText("Untuk Reels")).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    dialog.getByText(`Caption uji Instagram Reels [en]: ${clip.title}`).first(),
  ).toBeVisible();
  // Hashtag dirapikan worker: huruf kecil, `#` ditambah, duplikat & angka saja dibuang.
  await expect(
    dialog.getByText("#e2e #klipuji #tips", { exact: true }),
  ).toHaveCount(1);
  // Hashtag di dalam caption dibuang (ada di field sendiri).
  await expect(dialog.getByText("#tidakboleh")).toHaveCount(0);
  await expect(
    dialog.getByText(`Varian uji untuk ${clip.title}`),
  ).toBeVisible();

  // Buat ulang untuk platform lain memakai job baru; hasil lama diganti.
  await dialog.getByRole("radio", { name: "Shorts" }).click();
  await dialog.getByRole("button", { name: "Buat ulang" }).click();
  await expect(dialog.getByText("Untuk Shorts")).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog.getByText("Untuk Reels")).toHaveCount(0);
  await expect(
    dialog.getByText(`Caption uji YouTube Shorts [en]: ${clip.title}`).first(),
  ).toBeVisible();

  // Buka lagi setelah ditutup: hasil terakhir langsung tampil tanpa memanggil Gemini lagi.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Caption" }).first().click();
  await expect(
    page.getByRole("dialog").getByText("Untuk Shorts"),
  ).toBeVisible();
});

test("hapus proyek lewat menu … menghapus folder medianya", async ({
  page,
  request,
}) => {
  // Tunggu semua job proyek selesai: proyek tidak bisa dihapus selama worker mengerjakannya.
  const project = await waitForJob(request, "en", "discover");
  await waitForJob(request, "en", "reframe");
  const mediaDir = path.join(e2eDataDir(), "media", project.id);
  expect(existsSync(path.join(mediaDir, "proxy.mp4"))).toBe(true);
  expect(existsSync(path.join(mediaDir, "thumb.jpg"))).toBe(true);

  await page.goto("/");
  await page
    .getByRole("button", { name: `Menu proyek ${projectName("en")}` })
    .click();
  await page.getByRole("menuitem", { name: "Hapus proyek" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("dihapus permanen");
  await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
  // Selama dialog terbuka, isi halaman aria-hidden (modal) → tunggu dialog tertutup dulu.
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: projectName("en") })).toHaveCount(
    0,
  );
  expect(existsSync(mediaDir)).toBe(false);
  expect(await findProject(request, "en")).toBeUndefined();
  // Proyek lain tidak tersentuh.
  expect(await findProject(request, "id")).toBeDefined();
});
