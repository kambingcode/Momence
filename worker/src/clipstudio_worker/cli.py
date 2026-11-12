"""Presentation: CLI Typer + loop job. Hanya memanggil use case dari container."""

import os
import signal
import threading
import time
from collections.abc import Callable, Sequence
from types import FrameType

import structlog
import typer

from clipstudio_worker.bootstrap import SetupError, build_container, configure_logging
from clipstudio_worker.config import ConfigError, load_config
from clipstudio_worker.modules.jobs.application import Job, JobRunner
from clipstudio_worker.modules.projects.application import BackfillThumbnails, CleanMedia

app = typer.Typer(help="ClipStudio worker", no_args_is_help=True)
log = structlog.get_logger()

# Sinyal kedua dalam jeda ini dianggap kembaran dari `uv run` (meneruskan Ctrl+C) dan diabaikan.
TWIN_SIGNAL_S = 1.0
# Jeda detak status worker (halaman Settings menganggap worker mati setelah 90 dtk tanpa detak).
HEARTBEAT_S = 30.0


def _write_stderr(text: str) -> None:
    os.write(2, text.encode())


class StopRequest:
    """Permintaan berhenti dari SIGINT/SIGTERM: selesaikan job yang berjalan lalu berhenti.

    Handler sinyal Python berjalan di thread utama di sela bytecode, jadi handler ini tidak boleh
    mengambil lock apa pun (`threading.Event.set`, logger): bila sinyal kedua tiba di tengah
    handler pertama — kembaran dari `uv run` — keduanya menunggu lock yang dipegang thread yang
    sama dan worker macet. Karena itu handler hanya mengubah atribut dan menulis langsung ke fd.
    """

    def __init__(
        self,
        clock: Callable[[], float] = time.monotonic,
        write: Callable[[str], None] = _write_stderr,
    ) -> None:
        self.requested = False
        self._first_at = 0.0
        self._clock = clock
        self._write = write

    def handle(self, signum: int, _frame: FrameType | None) -> None:
        if self.requested:
            # Ctrl+C kedua yang disengaja (bukan kembaran) = berhenti paksa.
            if self._clock() - self._first_at < TWIN_SIGNAL_S:
                return
            raise KeyboardInterrupt
        # Waktu dulu, baru flag: handler bersarang di antaranya tak boleh dikira Ctrl+C kedua.
        self._first_at = self._clock()
        self.requested = True
        name = signal.Signals(signum).name
        self._write(f"Berhenti setelah job ini ({name}); Ctrl+C lagi = berhenti paksa.\n")


class Heartbeat:
    """Panggil `beat` tiap `interval` detik dari thread daemon, juga selama job berat berjalan.

    Galat (mis. DB sedang terkunci) hanya dicatat; detak berikutnya mencoba lagi. `stop` dipanggil
    dari alur biasa, tidak pernah dari handler sinyal (lihat `StopRequest`).
    """

    def __init__(self, beat: Callable[[], None], interval: float = HEARTBEAT_S) -> None:
        self._beat = beat
        self._interval = interval
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="heartbeat", daemon=True)

    def start(self) -> None:
        self._safe_beat()
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)

    def _loop(self) -> None:
        while not self._stop.wait(self._interval):
            self._safe_beat()

    def _safe_beat(self) -> None:
        try:
            self._beat()
        except Exception as exc:
            log.warning("detak_gagal", error=f"{type(exc).__name__}: {exc}")


@app.callback()
def main() -> None:
    """ClipStudio worker."""
    configure_logging()


@app.command()
def info() -> None:
    """Tampilkan lokasi data & database yang dipakai worker."""
    try:
        config = load_config()
    except ConfigError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1) from exc
    typer.echo(f"data_dir: {config.data_dir}")
    typer.echo(f"database: {config.database_path}")
    typer.echo(f"whisper:  {config.whisper_model}")
    typer.echo(f"gemini:   {config.gemini_model}")
    typer.echo(f"unduhan:  {config.download_concurrency} fragmen paralel")
    typer.echo(f"discover: {config.discover_concurrency} permintaan Gemini paralel")
    # Jangan pernah mencetak isi key.
    key_status = "ada" if config.gemini_api_key else "belum diisi (worker/.env)"
    typer.echo(f"GEMINI_API_KEY: {key_status}")


@app.command()
def run(
    poll_interval: float = typer.Option(1.0, help="Jeda (detik) saat antrean kosong."),
    once: bool = typer.Option(False, help="Berhenti setelah antrean kosong."),
) -> None:
    """Ambil job dari antrean dan jalankan satu per satu."""
    try:
        container = build_container()
    except SetupError as exc:
        log.error("setup_gagal", reason=str(exc))
        raise typer.Exit(code=1) from exc

    stop = StopRequest()
    signal.signal(signal.SIGINT, stop.handle)
    signal.signal(signal.SIGTERM, stop.handle)

    log.info("worker_mulai", database=str(container.config.database_path))
    _clean_media(container.clean_media)
    _backfill_thumbnails(container.backfill_thumbnails)
    heartbeat = Heartbeat(container.worker_status.heartbeat)
    heartbeat.start()
    try:
        _run_lanes(container.job_runner, container.background_runners, stop, poll_interval, once)
    finally:
        heartbeat.stop()
        # Halaman Settings langsung menampilkan "tidak berjalan" (juga setelah berhenti paksa).
        try:
            container.worker_status.stopped()
        except Exception as exc:
            log.warning("status_berhenti_gagal", error=f"{type(exc).__name__}: {exc}")
    log.info("worker_berhenti")


def _clean_media(clean: CleanMedia) -> None:
    # Bersih-bersih tidak boleh menghalangi worker mulai.
    try:
        result = clean()
    except Exception as exc:
        log.warning("bersih_media_gagal", error=f"{type(exc).__name__}: {exc}")
        return
    if result.orphan_dirs or result.partial_files:
        log.info(
            "media_dibersihkan",
            folder_yatim=len(result.orphan_dirs),
            file_sementara=len(result.partial_files),
            mb=round(result.freed_bytes / 1_048_576, 1),
        )


def _backfill_thumbnails(backfill: BackfillThumbnails) -> None:
    # Hiasan dashboard: tidak boleh menghalangi worker mulai.
    try:
        result = backfill()
    except Exception as exc:
        log.warning("thumbnail_backfill_gagal", error=f"{type(exc).__name__}: {exc}")
        return
    if result.created or result.failed:
        log.info("thumbnail_dibuat", berhasil=result.created, gagal=result.failed)


def _recover_interrupted(runner: JobRunner) -> None:
    interrupted = runner.recover_interrupted()
    for job in interrupted.requeued:
        log.warning("job_diulang", job_id=job.id, type=job.type, attempt=job.attempts)
    for job in interrupted.failed:
        log.error("job_dihentikan", job_id=job.id, type=job.type, attempt=job.attempts)


class LaneActivity:
    """Jumlah lane yang sedang menjalankan job. Mengklaim job dan mencatatnya aktif dilakukan di
    bawah satu kunci, sehingga `--once` tahu pasti kapan semuanya habis: job lanjutan hanya
    diantre oleh job yang sedang berjalan, jadi "tidak ada yang bisa diklaim & tidak ada yang
    berjalan" berarti benar-benar selesai."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active = 0

    def claim(self, runner: JobRunner) -> tuple[Job | None, bool]:
        """(job, drained): `drained` = tak ada job untuk lane ini dan tak ada lane yang sibuk."""
        with self._lock:
            job = runner.claim_next()
            if job is not None:
                self._active += 1
            return job, job is None and self._active == 0

    def finished(self) -> None:
        with self._lock:
            self._active -= 1


def _run_lanes(
    main: JobRunner,
    background: Sequence[tuple[str, JobRunner]],
    stop: StopRequest,
    poll_interval: float,
    once: bool,
) -> None:
    """Jalankan lane utama di thread ini dan tiap lane latar di thread sendiri.

    Lane utama memegang job berat yang memakai pustaka non-thread-safe (MLX Whisper, MediaPipe) —
    itu harus selalu di thread yang sama; lane latar hanya untuk unduhan & ffmpeg yang tidak boleh
    menunggu job berat (mis. video 12 menit mengantre di belakang transkripsi 15 menit).
    """
    # Job `running` di sini ditinggalkan worker sebelumnya (kunci menjamin hanya satu worker).
    _recover_interrupted(main)
    activity = LaneActivity()
    threads = [
        threading.Thread(
            target=_lane_thread,
            args=(name, runner, activity, stop, poll_interval, once),
            name=f"lane-{name}",
            daemon=True,
        )
        for name, runner in background
    ]
    for thread in threads:
        thread.start()
    _run_lane("utama", main, activity, stop, poll_interval, once)
    # Berhenti normal: tunggu job lane latar selesai. (Berhenti paksa = KeyboardInterrupt melewati
    # baris ini; thread daemon ikut mati.)
    for thread in threads:
        thread.join()


def _lane_thread(
    name: str,
    runner: JobRunner,
    activity: LaneActivity,
    stop: StopRequest,
    poll_interval: float,
    once: bool,
) -> None:
    try:
        _run_lane(name, runner, activity, stop, poll_interval, once)
    except Exception as exc:
        # Lane mati tanpa suara = job-nya menggantung selamanya; hentikan worker agar terlihat.
        log.error("lane_mati", lane=name, exc_info=exc)
        stop.requested = True


def _run_lane(
    name: str,
    runner: JobRunner,
    activity: LaneActivity,
    stop: StopRequest,
    poll_interval: float,
    once: bool,
) -> None:
    idle = False
    while not stop.requested:
        job, drained = activity.claim(runner)
        if job is None:
            if not idle:
                log.info("idle", lane=name)
                idle = True
            if once and drained:
                break
            # Sinyal tidak memotong sleep (PEP 475): berhenti paling lambat setelah satu jeda.
            time.sleep(poll_interval)
            continue

        idle = False
        try:
            _run_job(runner, job, name)
        finally:
            activity.finished()


def _run_job(runner: JobRunner, job: Job, lane: str) -> None:
    with structlog.contextvars.bound_contextvars(job_id=job.id, project_id=job.project_id):
        log.info("job_mulai", type=job.type, attempt=job.attempts, lane=lane)
        started = time.monotonic()
        outcome = runner.run(job)
        elapsed = round(time.monotonic() - started, 2)
        if outcome.status == "done":
            log.info("job_selesai", seconds=elapsed)
        elif outcome.exception is not None:
            # Galat tak terduga: traceback lengkap hanya di log, pesan ringkas di web.
            log.error("job_gagal", seconds=elapsed, error=outcome.error, exc_info=outcome.exception)
        else:
            log.error("job_gagal", seconds=elapsed, error=outcome.error)
