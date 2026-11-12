"""Aturan murni auto-reframe: subjek utama per sampel → jalur crop halus per rasio.

Satuan: pecahan 0–1 lebar/tinggi video sumber (sama untuk proxy & sumber).
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, field

from clipstudio_worker.modules.reframe.domain.analysis import FACE_FPS, ClipAnalysis, FaceBox

# Versi algoritma crop; naikkan bila hasilnya berubah agar crop dihitung ulang (tanpa deteksi).
CROP_VERSION = 1
ASPECT_RATIOS: dict[str, tuple[int, int]] = {"9:16": (9, 16), "1:1": (1, 1), "16:9": (16, 9)}

# Celah deteksi ≤ 1 dtk masih dianggap wajah yang sama (kedip, menoleh).
MAX_GAP_SAMPLES = round(FACE_FPS)
# Track lebih pendek dari 0,6 dtk = deteksi sesaat/palsu, tidak dijadikan subjek.
MIN_TRACK_SAMPLES = 3
# Dead-zone = 15 % lebar/tinggi crop: gerak kecil subjek (bersandar, gestur) tidak menggeser
# crop. Begitu subjek keluar zona, crop bergerak sampai subjek kembali dalam ½ zona (histeresis),
# sehingga crop tidak berhenti di tepi zona tempat guncangan kecil langsung menggesernya lagi.
# Disetel pada video wawancara + video subjek bergerak/berguncang (lihat TASKS.md T7.2).
DEAD_ZONE = 0.15
SETTLE = 0.5
# Faktor EMA per sampel (5 fps) → ±90 % jarak ditempuh dalam ±1,2 dtk.
SMOOTHING = 0.35
# Crop vertikal: wajah ditaruh sedikit di atas tengah (ruang kepala).
FACE_LEVEL = 0.4
_PRECISION = 4


@dataclass(frozen=True)
class CropRect:
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class CropKeyframe:
    # Posisi di video sumber (ms). Di antara keyframe, crop diinterpolasi linear.
    t_ms: int
    rect: CropRect


def crop_size(width: int, height: int, ratio: tuple[int, int]) -> tuple[float, float]:
    """Crop terbesar dengan rasio `ratio` di dalam frame `width`×`height` (tanpa zoom)."""
    target = ratio[0] / ratio[1]
    source = width / height
    if math.isclose(target, source, rel_tol=1e-3):
        return 1.0, 1.0
    if target < source:
        return target / source, 1.0
    return 1.0, source / target


@dataclass
class _Track:
    boxes: dict[int, FaceBox] = field(default_factory=dict[int, FaceBox])
    weight: float = 0.0

    @property
    def first(self) -> int:
        return min(self.boxes)

    @property
    def last(self) -> int:
        return max(self.boxes)

    def center_at(self, index: int) -> tuple[float, float]:
        """Titik tengah wajah; di celah deteksi diinterpolasi dari sampel terdekat."""
        if index in self.boxes:
            return _center(self.boxes[index])
        before = max(i for i in self.boxes if i < index)
        after = min(i for i in self.boxes if i > index)
        share = (index - before) / (after - before)
        (x0, y0), (x1, y1) = _center(self.boxes[before]), _center(self.boxes[after])
        return x0 + (x1 - x0) * share, y0 + (y1 - y0) * share


def _center(box: FaceBox) -> tuple[float, float]:
    return box.x + box.width / 2, box.y + box.height / 2


def face_tracks(faces: Sequence[Sequence[FaceBox]], aspect: float) -> list[_Track]:
    """Hubungkan wajah antar-sampel menjadi track: tiap wajah ke track terdekat yang terlihat
    ≤ `MAX_GAP_SAMPLES` lalu, bila pusatnya bergeser kurang dari ukuran wajah. `aspect` = lebar /
    tinggi sumber, agar jarak horizontal & vertikal sebanding."""
    tracks: list[_Track] = []
    for index, sample in enumerate(faces):
        pairs: list[tuple[float, int, int]] = []
        for t, track in enumerate(tracks):
            last = track.last
            if index - last > MAX_GAP_SAMPLES:
                continue
            ref = track.boxes[last]
            for f, face in enumerate(sample):
                (x0, y0), (x1, y1) = _center(ref), _center(face)
                distance = math.hypot((x1 - x0) * aspect, y1 - y0)
                if distance <= max(ref.height, face.height):
                    pairs.append((distance, t, f))
        used_tracks: set[int] = set()
        used_faces: set[int] = set()
        for _, t, f in sorted(pairs):
            if t in used_tracks or f in used_faces:
                continue
            used_tracks.add(t)
            used_faces.add(f)
            tracks[t].boxes[index] = sample[f]
        for f, face in enumerate(sample):
            if f not in used_faces:
                tracks.append(_Track({index: face}))
    for track in tracks:
        track.weight = sum(b.width * b.height * b.score for b in track.boxes.values())
    return tracks


def subject_centers(
    faces: Sequence[Sequence[FaceBox]], aspect: float
) -> list[tuple[float, float] | None]:
    """Pusat subjek per sampel: track yang hadir dengan bobot terbesar (terbesar × terlama).
    Bobot global membuat pilihan stabil — subjek baru dipilih hanya bila subjek utama tidak
    hadir. Tanpa track yang hadir → `None`."""
    tracks = [t for t in face_tracks(faces, aspect) if len(t.boxes) >= MIN_TRACK_SAMPLES]
    centers: list[tuple[float, float] | None] = []
    for index in range(len(faces)):
        present = [t for t in tracks if t.first <= index <= t.last]
        if not present:
            centers.append(None)
            continue
        main = max(present, key=lambda t: t.weight)
        centers.append(main.center_at(index))
    return centers


def _fill_gaps(values: Sequence[float | None], default: float) -> list[float]:
    """Sampel tanpa subjek: di antara dua posisi → interpolasi, di tepi → tahan posisi terdekat,
    tanpa subjek sama sekali → `default` (crop tengah)."""
    known = [i for i, v in enumerate(values) if v is not None]
    if not known:
        return [default] * len(values)
    filled: list[float] = []
    for i, value in enumerate(values):
        if value is not None:
            filled.append(value)
            continue
        before = max((k for k in known if k < i), default=None)
        after = min((k for k in known if k > i), default=None)
        if before is None or after is None:
            nearest = after if before is None else before
            assert nearest is not None
            filled.append(_known(values, nearest))
            continue
        share = (i - before) / (after - before)
        start, end = _known(values, before), _known(values, after)
        filled.append(start + (end - start) * share)
    return filled


def _known(values: Sequence[float | None], index: int) -> float:
    value = values[index]
    assert value is not None
    return value


def smooth(targets: Sequence[float], dead_zone: float, factor: float = SMOOTHING) -> list[float]:
    """EMA dengan dead-zone & histeresis: selama target di dalam ±`dead_zone` dari posisi
    sekarang, crop diam; begitu keluar, crop mendekat (faktor `factor` per sampel) sampai target
    kembali dalam ±`dead_zone × SETTLE`, lalu diam lagi."""
    if not targets:
        return []
    current = targets[0]
    moving = False
    result = [current]
    for target in targets[1:]:
        error = abs(target - current)
        if error > dead_zone:
            moving = True
        elif error <= dead_zone * SETTLE:
            moving = False
        if moving:
            current += factor * (target - current)
        result.append(current)
    return result


def _axis_path(
    centers: Sequence[float | None], size: float, offset: float, default: float
) -> list[float]:
    """Posisi awal crop di satu sumbu untuk satu adegan; sumbu yang tidak terpotong → 0."""
    if size >= 1.0:
        return [0.0] * len(centers)
    targets = _fill_gaps([None if c is None else c + offset for c in centers], default)
    smoothed = smooth(targets, DEAD_ZONE * size)
    return [min(1.0 - size, max(0.0, c - size / 2)) for c in smoothed]


def _scenes(times: Sequence[int], start_ms: int, cuts: Sequence[int]) -> list[tuple[int, range]]:
    """(waktu mulai adegan, indeks sampelnya) per adegan; adegan tanpa sampel dilewati."""
    starts = [start_ms, *cuts]
    bounds = [next((i for i, t in enumerate(times) if t >= s), len(times)) for s in starts]
    bounds[0] = 0
    bounds.append(len(times))
    return [
        (begin_ms, range(a, b))
        for begin_ms, a, b in zip(starts, bounds, bounds[1:], strict=False)
        if b > a
    ]


def _rect(x: float, y: float, width: float, height: float) -> CropRect:
    return CropRect(*(round(v, _PRECISION) for v in (x, y, width, height)))


def crop_track(analysis: ClipAnalysis, ratio: tuple[int, int]) -> list[CropKeyframe]:
    """Keyframe crop `ratio` sepanjang klip, satu per sampel lalu dipadatkan. Crop selebar/setinggi
    frame (tanpa zoom) dan hanya bergeser di sumbu yang terpotong. Di batas adegan crop melompat
    (keyframe 1 ms sebelum cut menahan posisi lama), tidak meluncur. Rasio sama dengan sumber →
    `[]` (frame utuh)."""
    width, height = crop_size(analysis.width, analysis.height, ratio)
    if (width, height) == (1.0, 1.0) or not analysis.samples:
        return []
    aspect = analysis.width / analysis.height
    times = [s.t_ms for s in analysis.samples]
    keyframes: list[CropKeyframe] = []
    for begin_ms, scene in _scenes(times, analysis.start_ms, analysis.scene_cuts_ms):
        centers = subject_centers([analysis.samples[i].faces for i in scene], aspect)
        xs = _axis_path([None if c is None else c[0] for c in centers], width, 0.0, 0.5)
        # Wajah di `FACE_LEVEL` tinggi crop: pusat crop berada di bawah wajah.
        ys = _axis_path(
            [None if c is None else c[1] for c in centers],
            height,
            (0.5 - FACE_LEVEL) * height,
            0.5,
        )
        rects = [_rect(x, y, width, height) for x, y in zip(xs, ys, strict=True)]
        if keyframes:
            keyframes.append(CropKeyframe(begin_ms - 1, keyframes[-1].rect))
            if times[scene[0]] > begin_ms:
                keyframes.append(CropKeyframe(begin_ms, rects[0]))
        keyframes.extend(CropKeyframe(times[i], r) for i, r in zip(scene, rects, strict=True))
    return simplify(keyframes)


def _interpolate(a: CropKeyframe, b: CropKeyframe, t_ms: int) -> tuple[float, float]:
    share = (t_ms - a.t_ms) / (b.t_ms - a.t_ms)
    return (
        a.rect.x + (b.rect.x - a.rect.x) * share,
        a.rect.y + (b.rect.y - a.rect.y) * share,
    )


def simplify(keyframes: Sequence[CropKeyframe], tolerance: float = 5e-4) -> list[CropKeyframe]:
    """Buang keyframe yang (dalam `tolerance`) sudah dihasilkan interpolasi linear tetangganya —
    crop yang diam atau bergerak lurus cukup diwakili ujung-ujungnya. Tolerance 5e-4 = ±1 px
    pada lebar 1920."""
    if len(keyframes) <= 2:
        return list(keyframes)
    kept = [keyframes[0]]
    anchor = 0
    for i in range(1, len(keyframes) - 1):
        following = keyframes[i + 1]
        # Bisakah semua keyframe sejak anchor sampai i diwakili garis anchor → i+1?
        covered = all(
            max(abs(x - k.rect.x), abs(y - k.rect.y)) <= tolerance
            for k in keyframes[anchor + 1 : i + 1]
            for x, y in [_interpolate(keyframes[anchor], following, k.t_ms)]
        )
        if not covered:
            kept.append(keyframes[i])
            anchor = i
    kept.append(keyframes[-1])
    return kept


def crop_tracks(analysis: ClipAnalysis) -> dict[str, list[CropKeyframe]]:
    """Jalur crop untuk setiap rasio yang bisa dipilih di editor."""
    return {name: crop_track(analysis, ratio) for name, ratio in ASPECT_RATIOS.items()}
