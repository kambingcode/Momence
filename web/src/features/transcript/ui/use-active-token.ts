"use client";

import { useEffect, useState } from "react";
import {
  type TimedToken,
  tokenIndexAt,
} from "@/modules/transcript/application";

/**
 * Indeks token yang sedang diucapkan pada posisi video. Saat diputar dibaca tiap frame
 * (`timeupdate` hanya ±4×/detik — terlalu kasar untuk sorotan per kata); saat berhenti/seek
 * dibaca sekali. State hanya berubah bila indeksnya berubah.
 */
export function useActiveToken(
  video: HTMLVideoElement | null,
  tokens: readonly TimedToken[],
): number {
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!video) return;
    let frame = 0;
    const update = () => {
      const index = tokenIndexAt(tokens, video.currentTime * 1000);
      setActive((previous) => (previous === index ? previous : index));
    };
    const loop = () => {
      update();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      update();
    };

    video.addEventListener("play", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    video.addEventListener("seeked", update);
    video.addEventListener("loadedmetadata", update);
    if (video.paused) update();
    else start();
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("play", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
      video.removeEventListener("seeked", update);
      video.removeEventListener("loadedmetadata", update);
    };
  }, [video, tokens]);

  return active;
}
