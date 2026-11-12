"""Adapter PySceneDetect (AdaptiveDetector): tahan gerak kamera, tetap peka pada cut keras."""

import importlib
from typing import Any

import numpy as np

from clipstudio_worker.modules.reframe.application import (
    Frame,
    SceneCutDetector,
    SceneCutSession,
)

# Adegan minimal 0,5 dtk: kilatan/transisi singkat tidak dihitung dua cut.
_MIN_SCENE_SECONDS = 0.5


def _module(name: str) -> Any:
    # Diimpor saat dipakai (memuat OpenCV) agar `worker --help` tetap cepat.
    return importlib.import_module(name)


class _Session(SceneCutSession):
    def __init__(self, fps: float) -> None:
        scenedetect = _module("scenedetect")
        self._fps = float(fps)
        self._timecode: Any = scenedetect.FrameTimecode
        self._detector: Any = scenedetect.AdaptiveDetector(
            min_scene_len=max(1, round(_MIN_SCENE_SECONDS * fps))
        )
        self._index = 0
        self._cuts: list[int] = []

    def push(self, frame: Frame) -> None:
        # PySceneDetect mengharapkan BGR (OpenCV).
        bgr = np.ascontiguousarray(frame[:, :, ::-1])
        self._collect(self._detector.process_frame(self._timecode(self._index, self._fps), bgr))
        self._index += 1

    def finish(self) -> list[int]:
        self._collect(self._detector.post_process(self._timecode(self._index, self._fps)))
        return sorted(set(self._cuts))

    def _collect(self, cuts: list[Any]) -> None:
        self._cuts.extend(int(cut.frame_num) for cut in cuts)


class PySceneDetectCutDetector(SceneCutDetector):
    def start(self, fps: float) -> SceneCutSession:
        return _Session(fps)
