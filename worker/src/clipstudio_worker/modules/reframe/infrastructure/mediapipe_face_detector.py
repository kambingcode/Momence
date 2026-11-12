"""Adapter MediaPipe Face Detector (BlazeFace full-range: wajah kecil di shot lebar tetap
terdeteksi). Model diunduh sekali ke `models_dir`, dimuat sekali, lalu dipakai ulang antar-job."""

import hashlib
import importlib
import os
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np

from clipstudio_worker.modules.reframe.application import (
    FaceBox,
    FaceDetector,
    Frame,
    ReframeError,
)

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/"
    "blaze_face_full_range/float16/1/blaze_face_full_range.tflite"
)
MODEL_SHA256 = "3698b18f063835bc609069ef052228fbe86d9c9a6dc8dcb7c7c2d69aed2b181b"
MODEL_FILE = "blaze_face_full_range.tflite"
# Di bawah ini banyak deteksi palsu (pola latar); wajah kecil asli umumnya ≥ 0,7.
MIN_CONFIDENCE = 0.6


def _module(name: str) -> Any:
    # mediapipe tidak punya anotasi tipe; diimpor saat dipakai agar `worker --help` tetap cepat.
    return importlib.import_module(name)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class MediaPipeFaceDetector(FaceDetector):
    def __init__(self, models_dir: Path, model_url: str = MODEL_URL) -> None:
        self._models_dir = models_dir
        self._model_url = model_url
        self._detector: Any = None

    def detect(self, frame: Frame) -> list[FaceBox]:
        mp = _module("mediapipe")
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(frame))
        result = self._load().detect(image)
        height, width = frame.shape[:2]
        boxes: list[FaceBox] = []
        for detection in result.detections:
            box = detection.bounding_box
            boxes.append(
                FaceBox(
                    x=box.origin_x / width,
                    y=box.origin_y / height,
                    width=box.width / width,
                    height=box.height / height,
                    score=float(detection.categories[0].score),
                )
            )
        return boxes

    def _load(self) -> Any:
        if self._detector is None:
            vision = _module("mediapipe.tasks.python.vision")
            base_options = _module("mediapipe.tasks.python").BaseOptions
            options = vision.FaceDetectorOptions(
                base_options=base_options(model_asset_path=str(self._model_path())),
                running_mode=vision.RunningMode.IMAGE,
                min_detection_confidence=MIN_CONFIDENCE,
            )
            self._detector = vision.FaceDetector.create_from_options(options)
        return self._detector

    def _model_path(self) -> Path:
        path = self._models_dir / MODEL_FILE
        if path.is_file() and _sha256(path) == MODEL_SHA256:
            return path
        self._models_dir.mkdir(parents=True, exist_ok=True)
        partial = path.with_name(f".{path.name}.part")
        try:
            with urllib.request.urlopen(self._model_url, timeout=60) as response:
                partial.write_bytes(response.read())
            if _sha256(partial) != MODEL_SHA256:
                raise ReframeError("Model deteksi wajah yang diunduh rusak (checksum berbeda).")
            os.replace(partial, path)
        except OSError as exc:
            raise ReframeError(f"Model deteksi wajah gagal diunduh: {exc}") from exc
        finally:
            partial.unlink(missing_ok=True)
        return path
