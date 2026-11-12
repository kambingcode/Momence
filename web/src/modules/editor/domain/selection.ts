/**
 * Kursor & seleksi di panel transkrip, seperti editor teks. `caret` = posisi di antara token
 * (0 = sebelum token pertama, n = setelah token terakhir). Seleksi = token di antara `anchor`
 * dan `caret` (bila `anchor` tidak null dan berbeda dari `caret`).
 */
export interface Cursor {
  caret: number;
  anchor: number | null;
}

export const collapsedAt = (caret: number): Cursor => ({ caret, anchor: null });

/** Indeks token terseleksi [start, end) atau null bila tidak ada seleksi. */
export function selectedRange(cursor: Cursor): [number, number] | null {
  const { caret, anchor } = cursor;
  if (anchor === null || anchor === caret) return null;
  return [Math.min(anchor, caret), Math.max(anchor, caret)];
}

const clampCaret = (caret: number, count: number) =>
  Math.max(0, Math.min(count, caret));

/**
 * Langkah kursor ke kiri (-1) / kanan (+1) melewati satu token yang terlihat. Token di `skip`
 * (mis. bagian terhapus yang disembunyikan) tidak punya lebar, jadi ikut dilewati.
 * Tanpa `extend`, seleksi yang ada diciutkan ke tepinya.
 */
export function moveCaret(
  cursor: Cursor,
  direction: -1 | 1,
  extend: boolean,
  count: number,
  skip: (index: number) => boolean = () => false,
): Cursor {
  const range = selectedRange(cursor);
  if (!extend && range) return collapsedAt(direction < 0 ? range[0] : range[1]);
  let caret = clampCaret(cursor.caret, count);
  if (direction > 0) {
    while (caret < count && skip(caret)) caret += 1;
    if (caret < count) caret += 1;
  } else {
    while (caret > 0 && skip(caret - 1)) caret -= 1;
    if (caret > 0) caret -= 1;
  }
  return extend
    ? { caret, anchor: cursor.anchor ?? cursor.caret }
    : collapsedAt(caret);
}

/** Jarak gerak pointer (px) sebelum klik berubah menjadi seret. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * Seret dimulai hanya bila pointer benar-benar bergerak dari titik tekan. Token di bawah pointer
 * juga bisa berganti tanpa gerakan (halaman bergulir/berubah layout saat tombol ditekan); itu
 * bukan seret dan tidak boleh menyeleksi.
 */
export function isDragMove(
  start: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) >= DRAG_THRESHOLD_PX;
}

/** Seleksi seret dari token `origin` ke token `current` (keduanya ikut terseleksi). */
export function dragSelection(origin: number, current: number): Cursor {
  return current >= origin
    ? { anchor: origin, caret: current + 1 }
    : { anchor: origin + 1, caret: current };
}

export interface DeleteResult {
  /** Indeks token yang dipotong. */
  indices: number[];
  cursor: Cursor;
}

/**
 * Backspace (-1) / Delete (+1). Dengan seleksi: potong seleksi. Tanpa seleksi: potong token
 * terdekat yang belum terpotong di kiri/kanan kursor; kursor berpindah melewatinya.
 */
export function deleteAtCursor(
  cursor: Cursor,
  direction: -1 | 1,
  count: number,
  isRemoved: (index: number) => boolean,
): DeleteResult {
  const range = selectedRange(cursor);
  if (range) {
    const indices: number[] = [];
    for (let i = range[0]; i < range[1]; i += 1) indices.push(i);
    return { indices, cursor: collapsedAt(range[0]) };
  }
  if (direction < 0) {
    let i = clampCaret(cursor.caret, count) - 1;
    while (i >= 0 && isRemoved(i)) i -= 1;
    if (i < 0) return { indices: [], cursor };
    return { indices: [i], cursor: collapsedAt(i) };
  }
  let i = clampCaret(cursor.caret, count);
  while (i < count && isRemoved(i)) i += 1;
  if (i >= count) return { indices: [], cursor };
  return { indices: [i], cursor: collapsedAt(i + 1) };
}

/**
 * Token terpotong yang dipulihkan tombol "Pulihkan": yang ada di seleksi, atau (tanpa seleksi)
 * token terpotong tepat di kanan lalu di kiri kursor.
 */
export function restoreTargets(
  cursor: Cursor,
  count: number,
  isRemoved: (index: number) => boolean,
): number[] {
  const range = selectedRange(cursor);
  if (range) {
    const indices: number[] = [];
    for (let i = range[0]; i < range[1]; i += 1)
      if (isRemoved(i)) indices.push(i);
    return indices;
  }
  for (const i of [cursor.caret, cursor.caret - 1]) {
    if (i >= 0 && i < count && isRemoved(i)) return [i];
  }
  return [];
}
