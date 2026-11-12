"""Pembagian transkrip panjang menjadi jendela ±10 menit untuk dianalisis satu per satu."""

from collections.abc import Sequence

from clipstudio_worker.modules.clips.domain.clip import MAX_CLIP_MS
from clipstudio_worker.modules.clips.domain.sentences import Sentence

WINDOW_MS = 10 * 60_000
# Jendela berikutnya mengulang ekor jendela sebelumnya sepanjang klip terpanjang, sehingga klip
# yang melintasi batas jendela tetap utuh di salah satunya (duplikatnya dibuang saat dedup).
WINDOW_OVERLAP_MS = MAX_CLIP_MS


def split_windows(
    sentences: Sequence[Sentence],
    window_ms: int = WINDOW_MS,
    overlap_ms: int = WINDOW_OVERLAP_MS,
) -> list[list[Sentence]]:
    """Jendela berurutan dari kalimat utuh; sisa < setengah jendela digabung ke jendela terakhir."""
    windows: list[list[Sentence]] = []
    start = 0
    count = len(sentences)
    while start < count:
        end = start + 1
        while end < count and sentences[end].end_ms - sentences[start].start_ms <= window_ms:
            end += 1
        if end < count and sentences[-1].end_ms - sentences[end].start_ms < window_ms // 2:
            end = count
        windows.append(list(sentences[start:end]))
        if end == count:
            break
        overlap_from = sentences[end - 1].end_ms - overlap_ms
        next_start = end
        while next_start - 1 > start and sentences[next_start - 1].start_ms >= overlap_from:
            next_start -= 1
        start = next_start
    return windows
