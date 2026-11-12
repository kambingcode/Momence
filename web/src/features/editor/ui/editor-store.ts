import { createContext, useContext } from "react";
import { type TemporalState, temporal } from "zundo";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { placeBroll, removeBrollAt } from "@/modules/broll/application";
import type { CaptionStyle } from "@/modules/captions/application";
import {
  type BrollItem,
  defaultReframe,
  MAX_TEXT_OVERLAYS,
  type ReframeSettings,
  type TextOverlay,
} from "@/shared/schemas";
import {
  addRemoval,
  applyCorrections,
  clampTextPosition,
  collapsedAt,
  type Cursor,
  moveInStack,
  type RemovalGroup,
  type RemovalKind,
  restoreTouching,
  type TimeRange,
} from "@/modules/editor/application";

/** Bagian EditingScript yang diedit di editor; hanya bagian ini yang dilacak undo. */
export interface EditorDoc {
  removed: readonly RemovalGroup[];
  corrections: Readonly<Record<string, string>>;
  /** `null` = preset caption bawaan. */
  caption: CaptionStyle | null;
  reframe: ReframeSettings;
  /** B-roll terpasang, terurut menurut waktu & tidak tumpang-tindih. */
  broll: readonly BrollItem[];
  /** Teks custom; urutan = urutan tumpuk (yang terakhir paling depan). */
  textOverlays: readonly TextOverlay[];
}

/**
 * Dokumen dari state store, EditingScript tersimpan, atau draft (tanpa kursor & aksi).
 * `reframe` kosong (belum pernah diatur / draft lama) → pengaturan bawaan; draft lama tanpa
 * `broll` / `textOverlays` → tanpa B-roll / teks.
 */
export const docOf = ({
  removed,
  corrections,
  caption,
  reframe,
  broll,
  textOverlays,
}: Omit<EditorDoc, "reframe" | "broll" | "textOverlays"> & {
  reframe?: ReframeSettings | null;
  broll?: readonly BrollItem[];
  textOverlays?: readonly TextOverlay[];
}): EditorDoc => ({
  removed,
  corrections,
  caption,
  reframe: reframe ?? defaultReframe(),
  broll: broll ?? [],
  textOverlays: textOverlays ?? [],
});

/**
 * Temuan Speech cleanup yang sedang dinavigasi (dibagi panel kanan → teks transkrip). Hanya
 * digambar selama seleksi kursor persis sama dengan `range` — begitu pengguna memilih hal lain
 * temuannya otomatis tak lagi disorot. Bukan bagian dokumen (tak masuk undo/draft/simpan).
 */
export interface Finding {
  /** Indeks token [awal, akhir). */
  range: readonly [number, number];
  /** Jenis temuan ("Frasa pengisi"); `null` = jeda (tanpa label). */
  label: string | null;
  /** Urutan dalam jenisnya ("3 / 7"). */
  position: string;
}

/** Isi & gaya teks yang diubah lewat `updateText` (posisi & waktu punya aksinya sendiri). */
export type TextStyleChanges = Partial<
  Pick<TextOverlay, "text" | "font" | "fontSize" | "color">
>;

/** Gaya teks baru: putih, Montserrat, di tengah frame. */
export const NEW_TEXT_STYLE = {
  text: "Teks baru",
  x: 50,
  y: 50,
  fontSize: 7,
  color: "#ffffff",
  font: "montserrat",
} as const satisfies Omit<TextOverlay, "id" | "startMs" | "endMs">;

export interface EditorState extends EditorDoc {
  cursor: Cursor;
  setCursor: (cursor: Cursor) => void;
  finding: Finding | null;
  setFinding: (finding: Finding | null) => void;
  /** Ambang jeda (ms) dari slider Speech cleanup; `null` = panel belum menetapkan. */
  pauseThresholdMs: number | null;
  setPauseThresholdMs: (ms: number | null) => void;
  /** Potong token (soft delete) sebagai satu grup. */
  removeTokens: (tokenIds: readonly string[]) => void;
  /** Potong beberapa grup sekaligus (mis. Speech cleanup "Hapus semua") dalam satu langkah undo. */
  removeGroups: (
    groups: readonly { tokenIds: readonly string[]; kind: RemovalKind }[],
  ) => void;
  /** Pulihkan semua grup yang memuat salah satu token ini (satu langkah undo). */
  restoreTokens: (tokenIds: readonly string[]) => void;
  /**
   * Koreksi teks caption sekaligus (satu langkah undo); `null` / teks asli menghapus koreksi.
   * `originalText` = teks transkrip token itu.
   */
  correct: (
    updates: Readonly<Record<string, string | null>>,
    originalText: (tokenId: string) => string | undefined,
  ) => void;
  /**
   * Ganti gaya caption. Perubahan beruntun dari kontrol yang sama (`control`, mis. menyeret
   * slider ukuran) digabung menjadi satu langkah undo selama tidak ada langkah lain di antaranya
   * dan jaraknya ≤ `CAPTION_MERGE_MS`.
   */
  setCaption: (caption: CaptionStyle | null, control?: string) => void;
  /** Ubah pengaturan reframe (rasio, layout, Tracker); satu langkah undo per perubahan. */
  setReframe: (changes: Partial<ReframeSettings>) => void;
  /** Pasang B-roll (mengganti yang tumpang-tindih dengan rentangnya); satu langkah undo. */
  placeBroll: (item: BrollItem) => void;
  /** Lepas B-roll yang mulai di `startMs`; satu langkah undo. */
  removeBroll: (startMs: number) => void;
  /**
   * Teks yang dipilih (pratinjau / daftar / Peta klip). Bukan bagian dokumen; bisa merujuk teks
   * yang sudah tidak ada (mis. setelah undo) — pemakai memperlakukannya sebagai tanpa pilihan.
   */
  selectedTextId: string | null;
  selectText: (id: string | null) => void;
  /**
   * Tambah teks bergaya bawaan pada rentang ini lalu memilihnya; `null` bila sudah
   * `MAX_TEXT_OVERLAYS`. Satu langkah undo.
   */
  addText: (range: TimeRange) => string | null;
  /**
   * Ubah isi/gaya teks. Perubahan beruntun dari kontrol yang sama (`control`, mis. mengetik atau
   * menyeret slider ukuran) digabung jadi satu langkah undo, seperti `setCaption`.
   */
  updateText: (id: string, changes: TextStyleChanges, control?: string) => void;
  /**
   * Pindah teks (persen frame, dijepit 0–100). Semua perubahan dengan `gesture` yang sama (satu
   * seretan) digabung jadi satu langkah undo, berapa lama pun seretannya.
   */
  moveText: (
    id: string,
    position: { x: number; y: number },
    gesture?: string,
  ) => void;
  /**
   * Ganti rentang waktu teks (ms sumber; penjepitan ke klip oleh pemanggil, lihat
   * `clampTextRange`). `gesture` seperti `moveText`.
   */
  setTextRange: (id: string, range: TimeRange, gesture?: string) => void;
  /** Hapus teks (dan pilihannya); satu langkah undo. */
  removeText: (id: string) => void;
  /** Geser teks satu langkah di urutan tumpuk (`forward` = ke depan). */
  reorderText: (id: string, direction: "forward" | "backward") => void;
  /** Ganti seluruh dokumen (muat dari server/draft); bisa di-undo. */
  replaceDoc: (doc: EditorDoc) => void;
}

export type EditorStore = StoreApi<EditorState> & {
  temporal: StoreApi<TemporalState<EditorDoc>>;
};

/** Batas langkah undo per sesi editor. */
const HISTORY_LIMIT = 200;
/** Jarak maksimum antar-perubahan caption dari kontrol yang sama agar digabung. */
export const CAPTION_MERGE_MS = 1000;

export function createEditorStore(
  doc: EditorDoc,
  newId: () => string = () => crypto.randomUUID(),
  now: () => number = Date.now,
): EditorStore {
  // Perubahan terakhir yang boleh digabung: kuncinya, waktunya, dan entri riwayat yang dibuatnya.
  let lastEdit: { key: string; at: number; entry: unknown } | null = null;
  return createStore<EditorState>()(
    temporal(
      (set, get, api) => {
        /**
         * Jalankan `apply` (satu `set`); bila `key` sama dengan perubahan sebelumnya, masih dalam
         * `windowMs`, dan entri riwayat terakhir masih entri perubahan itu (tak ada langkah lain /
         * undo di antaranya), riwayat dijeda sehingga keduanya jadi satu langkah undo.
         */
        const mergeable = (
          key: string | undefined,
          windowMs: number,
          apply: () => void,
        ) => {
          // zundo mengetik `api.temporal` sebagai unknown di dalam pembuat state.
          const history = () => (api as EditorStore).temporal.getState();
          const at = now();
          const latest = () => history().pastStates.at(-1);
          const merge =
            key !== undefined &&
            lastEdit?.key === key &&
            at - lastEdit.at <= windowMs &&
            lastEdit.entry === latest();
          if (merge) {
            history().pause();
            apply();
            history().resume();
            lastEdit = { ...lastEdit!, at };
            return;
          }
          const before = latest();
          apply();
          // Perubahan tanpa efek tidak membuat entri; jangan gabungkan perubahan berikutnya ke
          // entri milik langkah lain.
          lastEdit =
            key !== undefined && latest() !== before
              ? { key, at, entry: latest() }
              : null;
        };
        const updateTexts = (
          state: EditorState,
          id: string,
          change: (item: TextOverlay) => TextOverlay,
        ): Partial<EditorState> | EditorState => {
          let changed = false;
          const textOverlays = state.textOverlays.map((item) => {
            if (item.id !== id) return item;
            const next = change(item);
            const same = (Object.keys(next) as (keyof TextOverlay)[]).every(
              (key) => next[key] === item[key],
            );
            if (same) return item;
            changed = true;
            return next;
          });
          return changed ? { textOverlays } : state;
        };
        return {
          ...doc,
          cursor: collapsedAt(0),
          setCursor: (cursor) => set({ cursor }),
          finding: null,
          setFinding: (finding) => set({ finding }),
          pauseThresholdMs: null,
          setPauseThresholdMs: (pauseThresholdMs) => set({ pauseThresholdMs }),
          removeTokens: (tokenIds) =>
            set((state) => {
              const removed = addRemoval(
                state.removed,
                tokenIds,
                newId(),
                "manual",
              );
              return removed === state.removed ? state : { removed };
            }),
          removeGroups: (groups) =>
            set((state) => {
              const removed = groups.reduce(
                (current, group) =>
                  addRemoval(current, group.tokenIds, newId(), group.kind),
                state.removed,
              );
              return removed === state.removed ? state : { removed };
            }),
          restoreTokens: (tokenIds) =>
            set((state) => {
              const removed = restoreTouching(state.removed, tokenIds);
              return removed === state.removed ? state : { removed };
            }),
          correct: (updates, originalText) =>
            set((state) => {
              const corrections = applyCorrections(
                state.corrections,
                updates,
                originalText,
              );
              return corrections === state.corrections
                ? state
                : { corrections };
            }),
          setCaption: (caption, control) =>
            mergeable(
              control === undefined ? undefined : `caption:${control}`,
              CAPTION_MERGE_MS,
              () =>
                set((state) =>
                  state.caption === caption ? state : { caption },
                ),
            ),
          setReframe: (changes) =>
            set((state) => {
              const reframe = { ...state.reframe, ...changes };
              const same = (
                Object.keys(reframe) as (keyof ReframeSettings)[]
              ).every((key) => reframe[key] === state.reframe[key]);
              return same ? state : { reframe };
            }),
          placeBroll: (item) =>
            set((state) => ({ broll: placeBroll(state.broll, item) })),
          removeBroll: (startMs) =>
            set((state) => {
              const broll = removeBrollAt(state.broll, startMs);
              return broll.length === state.broll.length ? state : { broll };
            }),
          selectedTextId: null,
          selectText: (selectedTextId) => set({ selectedTextId }),
          addText: (range) => {
            if (get().textOverlays.length >= MAX_TEXT_OVERLAYS) return null;
            const id = newId();
            set((state) => ({
              textOverlays: [
                ...state.textOverlays,
                { id, ...range, ...NEW_TEXT_STYLE },
              ],
              selectedTextId: id,
            }));
            return id;
          },
          updateText: (id, changes, control) =>
            mergeable(
              control === undefined ? undefined : `text:${id}:${control}`,
              CAPTION_MERGE_MS,
              () =>
                set((state) =>
                  updateTexts(state, id, (item) => ({ ...item, ...changes })),
                ),
            ),
          moveText: (id, position, gesture) =>
            mergeable(
              gesture === undefined ? undefined : `move:${id}:${gesture}`,
              Infinity,
              () =>
                set((state) =>
                  updateTexts(state, id, (item) => ({
                    ...item,
                    x: clampTextPosition(position.x),
                    y: clampTextPosition(position.y),
                  })),
                ),
            ),
          setTextRange: (id, range, gesture) =>
            mergeable(
              gesture === undefined ? undefined : `range:${id}:${gesture}`,
              Infinity,
              () =>
                set((state) =>
                  range.endMs > range.startMs
                    ? updateTexts(state, id, (item) => ({
                        ...item,
                        startMs: range.startMs,
                        endMs: range.endMs,
                      }))
                    : state,
                ),
            ),
          removeText: (id) =>
            set((state) => {
              const textOverlays = state.textOverlays.filter(
                (t) => t.id !== id,
              );
              if (textOverlays.length === state.textOverlays.length)
                return state;
              return {
                textOverlays,
                selectedTextId:
                  state.selectedTextId === id ? null : state.selectedTextId,
              };
            }),
          reorderText: (id, direction) =>
            set((state) => {
              const textOverlays = moveInStack(
                state.textOverlays,
                id,
                direction,
              );
              return textOverlays === state.textOverlays
                ? state
                : { textOverlays };
            }),
          replaceDoc: (next) => set(docOf(next)),
        };
      },
      {
        partialize: (state: EditorState): EditorDoc => docOf(state),
        // Pergerakan kursor tidak masuk riwayat.
        equality: (a, b) =>
          a.removed === b.removed &&
          a.corrections === b.corrections &&
          a.caption === b.caption &&
          a.reframe === b.reframe &&
          a.broll === b.broll &&
          a.textOverlays === b.textOverlays,
        limit: HISTORY_LIMIT,
      },
    ),
  );
}

/** Pasangan [kunci, nilai] terurut: urutan kunci objek tidak berpengaruh pada pembanding. */
const sortedEntries = (value: object) =>
  Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** Kunci pembanding dokumen (urutan kunci objek di dalamnya tidak berpengaruh). */
export function docKey(doc: EditorDoc): string {
  return JSON.stringify([
    doc.removed,
    sortedEntries(doc.corrections),
    doc.caption && sortedEntries(doc.caption),
    sortedEntries(doc.reframe),
    doc.broll.map(sortedEntries),
    doc.textOverlays.map(sortedEntries),
  ]);
}

export const EditorStoreContext = createContext<EditorStore | null>(null);

function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditor dipakai di luar EditorStoreContext");
  return store;
}

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStore(), selector);
}

export function useEditorHistory<T>(
  selector: (state: TemporalState<EditorDoc>) => T,
): T {
  return useStore(useEditorStore().temporal, selector);
}
