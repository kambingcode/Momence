/**
 * Posisi pemutaran terakhir (ms video sumber) sebagai store kecil di luar React: pratinjau
 * menulisnya tiap frame, dan hanya komponen yang berlangganan (playhead peta klip) yang
 * dirender ulang — bukan seluruh editor.
 */
export interface Playhead {
  get(): number;
  set(sourceMs: number): void;
  subscribe(listener: () => void): () => void;
}

export function createPlayhead(initialMs: number): Playhead {
  let value = initialMs;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(sourceMs) {
      if (sourceMs === value) return;
      value = sourceMs;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
