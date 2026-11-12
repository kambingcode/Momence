import { type RefObject, useEffect, useState } from "react";

/**
 * `true` selama elemen berada dalam ±1 tinggi layar dari viewport. Margin selebar itu membuat
 * video sudah siap sebelum kartunya terlihat dan tidak terus dibuat-buang saat scroll pelan.
 */
export function useNearViewport(ref: RefObject<Element | null>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return near;
}
