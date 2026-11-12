import type { Job } from "@/modules/jobs/application";
import { JobStatus } from "./job-status";

/**
 * Kartu langkah proses proyek (unduh, transkripsi, cari klip, …) untuk halaman yang menunggu
 * hasil pipeline: judul sesuai keadaan, satu baris per job (ikon bentuk, progres, galat + Coba lagi).
 */
export function PipelineSteps({
  jobs,
  waitingFor,
}: {
  jobs: Job[];
  /** Kalimat penutup bila belum gagal, mis. "Klip muncul di sini setelah pencarian klip selesai." */
  waitingFor: string;
}) {
  const failed = jobs.some((job) => job.status === "failed");
  const title =
    jobs.length === 0
      ? "Belum ada proses"
      : failed
        ? "Ada langkah yang gagal"
        : "Sedang memproses video";
  return (
    <section
      aria-labelledby="pipeline-steps-heading"
      className="max-w-xl space-y-4 rounded-xl border p-5"
    >
      <div className="space-y-1">
        <h2 id="pipeline-steps-heading" className="text-base font-medium">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">
          {failed
            ? "Perbaiki penyebabnya bila perlu, lalu tekan Coba lagi pada langkah yang gagal."
            : waitingFor}
        </p>
      </div>
      {jobs.length > 0 && (
        <ol className="space-y-3 border-t pt-4">
          {jobs.map((job) => (
            <li key={job.id}>
              <JobStatus job={job} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
