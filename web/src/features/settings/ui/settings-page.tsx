"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleHelp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/features/projects/ui/format";
import { ProjectShell } from "@/features/projects/ui/project-shell";
import { formatPause } from "@/features/transcript/ui/format";
import type { SettingsOverview } from "@/modules/settings/application";
import { PAUSE_MIN_MS_RANGE, type Preferences } from "@/shared/schemas";
import { fetchSettings, savePreferences, settingsQueryKey } from "../api";
import { formatEntries, parseEntries } from "./entries";

/** Saran di kolom model; ID lain tetap boleh diketik. */
const MODEL_SUGGESTIONS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-4-argon",
];

export function SettingsPage() {
  const settings = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
    // Status worker (detak) ikut diperbarui selama halaman terbuka.
    refetchInterval: 15_000,
  });

  return (
    <ProjectShell title="Pengaturan">
      {settings.isPending ? (
        <p className="text-muted-foreground text-sm">Memuat…</p>
      ) : settings.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Gagal memuat pengaturan: {settings.error.message}
        </p>
      ) : (
        <div className="max-w-2xl space-y-6">
          <StatusSection overview={settings.data} />
          {/* Form diisi sekali dari server; refetch berkala tidak menimpa ketikan. */}
          <PreferencesForm
            initial={settings.data.preferences}
            defaults={settings.data.defaults}
            workerModel={settings.data.worker?.geminiModel ?? null}
          />
        </div>
      )}
    </ProjectShell>
  );
}

function StatusSection({ overview }: { overview: SettingsOverview }) {
  const { worker, keys } = overview;
  return (
    <section
      aria-labelledby="status-heading"
      className="space-y-3 rounded-lg border p-4 text-sm"
    >
      <h2 id="status-heading" className="font-medium">
        Status
      </h2>
      <ul className="space-y-2">
        <StatusRow
          state={worker ? (worker.online ? "ok" : "warn") : "unknown"}
          label="Worker"
          detail={
            worker ? (
              worker.online ? (
                `berjalan · aktif ${formatRelativeTime(worker.heartbeatAt)}`
              ) : (
                <>
                  tidak berjalan · terakhir aktif{" "}
                  {formatRelativeTime(worker.stoppedAt ?? worker.heartbeatAt)}.
                  Jalankan <code>uv run worker run</code> di worker/.
                </>
              )
            ) : (
              <>
                belum pernah berjalan. Jalankan <code>uv run worker run</code>{" "}
                di worker/.
              </>
            )
          }
        />
        <StatusRow
          state={worker ? (worker.geminiApiKey ? "ok" : "warn") : "unknown"}
          label="GEMINI_API_KEY"
          detail={
            worker ? (
              worker.geminiApiKey ? (
                "terisi (worker/.env)"
              ) : (
                <>
                  belum diisi di worker/.env — discover klip, rencana B-roll &
                  caption gagal kecuali <code>GOOGLE_API_KEY</code> ada di env
                  worker
                </>
              )
            ) : (
              "belum diketahui; dilaporkan worker saat berjalan"
            )
          }
        />
        <StatusRow
          state={keys.pixabay ? "ok" : "warn"}
          label="PIXABAY_API_KEY"
          detail={
            keys.pixabay
              ? "terisi (web/.env.local)"
              : "belum diisi di web/.env.local — pencarian video stok B-roll nonaktif"
          }
        />
        {worker && (
          <StatusRow state="ok" label="Whisper" detail={worker.whisperModel} />
        )}
      </ul>
      <p className="text-muted-foreground text-xs">
        Nilai key tidak pernah ditampilkan. Setelah mengubah file .env, jalankan
        ulang worker / server web.
      </p>
    </section>
  );
}

function StatusRow({
  state,
  label,
  detail,
}: {
  state: "ok" | "warn" | "unknown";
  label: string;
  detail: React.ReactNode;
}) {
  const Icon =
    state === "ok" ? CheckCircle2 : state === "warn" ? CircleAlert : CircleHelp;
  const color =
    state === "ok"
      ? "text-success"
      : state === "warn"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <li className="flex items-start gap-2">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
      <span>
        <span className="font-medium">{label}</span>{" "}
        <span className="text-muted-foreground break-words">{detail}</span>
      </span>
    </li>
  );
}

interface FormState {
  geminiModel: string;
  fillerWords: string;
  fillerPhrases: string;
  pauseMinMs: number;
}

const toForm = (p: Preferences): FormState => ({
  geminiModel: p.geminiModel ?? "",
  fillerWords: formatEntries(p.fillerWords),
  fillerPhrases: formatEntries(p.fillerPhrases),
  pauseMinMs: p.pauseMinMs,
});

const fromForm = (form: FormState): Preferences => ({
  geminiModel: form.geminiModel.trim() || null,
  fillerWords: parseEntries(form.fillerWords),
  fillerPhrases: parseEntries(form.fillerPhrases),
  pauseMinMs: form.pauseMinMs,
});

function PreferencesForm({
  initial,
  defaults,
  workerModel,
}: {
  initial: Preferences;
  defaults: Preferences;
  workerModel: string | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => toForm(initial));
  const [saved, setSaved] = useState(() => toForm(initial));
  const save = useMutation({
    mutationFn: savePreferences,
    onSuccess: (preferences) => {
      // Tampilkan bentuk yang sudah dirapikan server (entri ganda dibuang, dst.).
      const next = toForm(preferences);
      setForm(next);
      setSaved(next);
      queryClient.setQueryData<SettingsOverview>(settingsQueryKey, (old) =>
        old ? { ...old, preferences } : old,
      );
    },
  });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const update = (patch: Partial<FormState>) => {
    save.reset();
    setForm((current) => ({ ...current, ...patch }));
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(fromForm(form));
      }}
    >
      <section className="space-y-2 rounded-lg border p-4 text-sm">
        <h2 className="font-medium">
          <label htmlFor="gemini-model">Model Gemini</label>
        </h2>
        <input
          id="gemini-model"
          list="gemini-models"
          value={form.geminiModel}
          onChange={(event) =>
            update({ geminiModel: event.currentTarget.value })
          }
          placeholder={workerModel ?? "gemini-3.6-flash"}
          spellCheck={false}
          autoComplete="off"
          className="border-input bg-background h-9 w-full rounded-md border px-2 font-mono"
        />
        <datalist id="gemini-models">
          {MODEL_SUGGESTIONS.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <p className="text-muted-foreground">
          Dipakai job discover klip & rencana B-roll berikutnya. Kosong = bawaan
          worker
          {workerModel ? ` (${workerModel})` : " (CLIPSTUDIO_GEMINI_MODEL)"}.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border p-4 text-sm">
        <h2 className="font-medium">Daftar filler</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block">Kata pengisi</span>
            <textarea
              value={form.fillerWords}
              onChange={(event) =>
                update({ fillerWords: event.currentTarget.value })
              }
              rows={8}
              spellCheck={false}
              className="border-input bg-background w-full rounded-md border p-2 font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="block">Frasa pengisi</span>
            <textarea
              value={form.fillerPhrases}
              onChange={(event) =>
                update({ fillerPhrases: event.currentTarget.value })
              }
              rows={8}
              spellCheck={false}
              className="border-input bg-background w-full rounded-md border p-2 font-mono"
            />
          </label>
        </div>
        <p className="text-muted-foreground">
          Satu entri per baris (atau dipisah koma); huruf besar/kecil & huruf
          berulang diabaikan (&ldquo;Ummm&rdquo; = &ldquo;um&rdquo;). Kata
          pengisi ditandai di transkrip oleh job transkripsi berikutnya; kedua
          daftar langsung dipakai panel Speech cleanup di editor.
        </p>
      </section>

      <section className="space-y-2 rounded-lg border p-4 text-sm">
        <h2 className="font-medium">
          <label htmlFor="pause-min">Ambang jeda default</label>
        </h2>
        <div className="flex items-center gap-3">
          <input
            id="pause-min"
            type="range"
            min={PAUSE_MIN_MS_RANGE.min}
            max={PAUSE_MIN_MS_RANGE.max}
            step={PAUSE_MIN_MS_RANGE.step}
            value={form.pauseMinMs}
            onChange={(event) =>
              update({ pauseMinMs: Number(event.currentTarget.value) })
            }
            className="accent-primary w-48"
          />
          <span className="tabular-nums">{formatPause(form.pauseMinMs)}</span>
        </div>
        <p className="text-muted-foreground">
          Nilai awal slider &ldquo;Durasi minimum&rdquo; di kartu Jeda panel
          Speech cleanup.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => update(toForm(defaults))}
          disabled={JSON.stringify(form) === JSON.stringify(toForm(defaults))}
        >
          Kembalikan bawaan
        </Button>
        <span aria-live="polite" className="text-sm">
          {save.isError ? (
            <span role="alert" className="text-destructive">
              Gagal menyimpan: {save.error.message}
            </span>
          ) : save.isSuccess ? (
            <span className="text-muted-foreground">Tersimpan.</span>
          ) : dirty ? (
            <span className="text-muted-foreground">
              Ada perubahan belum disimpan.
            </span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
