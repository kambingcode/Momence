import { describe, expect, it, vi } from "vitest";
import { createPlayhead } from "./playhead-store";

describe("createPlayhead", () => {
  it("menyimpan nilai & memberi tahu pelanggan hanya saat berubah", () => {
    const playhead = createPlayhead(100);
    const listener = vi.fn();
    const unsubscribe = playhead.subscribe(listener);
    playhead.set(100);
    expect(listener).not.toHaveBeenCalled();
    playhead.set(250);
    expect(playhead.get()).toBe(250);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    playhead.set(300);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
