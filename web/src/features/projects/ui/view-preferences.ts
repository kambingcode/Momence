"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SORT, isProjectSort, type ProjectSort } from "./filter-sort";

export type ProjectView = "table" | "cards";

// `.v2`: grid kartu jadi bawaan (Tahap 20); pilihan "tabel" lama tidak terbawa.
const VIEW_KEY = "clipstudio.projects.view.v2";
const SORT_KEY = "clipstudio.projects.sort";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // mode privat / penyimpanan diblokir
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Pilihan tidak bertahan setelah reload; tampilan tetap berfungsi.
  }
}

/**
 * Pilihan tampilan (tabel/kartu) dan urutan yang bertahan antar kunjungan. Dibaca setelah mount
 * (bukan saat render pertama) supaya HTML server dan klien sama.
 */
export function useProjectViewPreferences() {
  const [view, setViewState] = useState<ProjectView>("cards");
  const [sort, setSortState] = useState<ProjectSort>(DEFAULT_SORT);

  useEffect(() => {
    const storedView = read(VIEW_KEY);
    if (storedView === "table" || storedView === "cards")
      setViewState(storedView);
    const storedSort = read(SORT_KEY);
    if (isProjectSort(storedSort)) setSortState(storedSort);
  }, []);

  const setView = useCallback((next: ProjectView) => {
    setViewState(next);
    write(VIEW_KEY, next);
  }, []);
  const setSort = useCallback((next: ProjectSort) => {
    setSortState(next);
    write(SORT_KEY, next);
  }, []);

  return { view, setView, sort, setSort };
}
