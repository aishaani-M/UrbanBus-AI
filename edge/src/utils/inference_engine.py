"""
UrbanBus Edge AI — Inference Engine

Unified wrapper for ONNX Runtime (and optionally TensorRT) inference.
Handles model loading, preprocessing, and postprocessing for all detector types.
"""

import numpy as np
import cv2
import time
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any
from loguru import logger

try:
    import onnxruntime as ort
except ImportError:
    ort = None
    logger.warning("onnxruntime not installed — inference will be unavailable")


class InferenceEngine:
    """
    ONNX Runtime inference wrapper with NMS postprocessing.
    Supports both GPU (CUDA) and CPU execution providers.
    """

    def __init__(
        self,
        model_path: str,
        input_size: Tuple[int, int] = (640, 640),
        confidence_threshold: float = 0.45,
        nms_threshold: float = 0.5,
        classes: Optional[Dict[int, str]] = None,
        device: str = "cuda",
    ):
        self.model_path = Path(model_path)
        self.input_size = input_size  # (width, height)
        self.confidence_threshold = confidence_threshold
        self.nms_threshold = nms_threshold
        self.classes = classes or {}
        self.device = device
        self.session = None
        self.input_name = None
        self.output_names = None
        self._warmup_done = False

        self._load_model()

    def _load_model(self):
        """Load ONNX model with appropriate execution provider."""
        if ort is None:
            logger.error("onnxruntime is not installed")
            return

        if not self.model_path.exists():
            logger.warning(
                f"Model file not found: {self.model_path}. "
                "Running in mock mode — detections will be simulated."
            )
            return

        providers = []
        if self.device == "cuda":
            providers.append(("CUDAExecutionProvider", {
                "device_id": 0,
                "arena_extend_strategy": "kNextPowerOfTwo",
                "cudnn_conv_algo_search": "HEURISTIC",
            }))
        providers.append("CPUExecutionProvider")

        try:
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess_options.intra_op_num_threads = 4

            self.session = ort.InferenceSession(
                str(self.model_path),
                sess_options=sess_options,
                providers=providers,
            )

            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [o.name for o in self.session.get_outputs()]

            active_provider = self.session.get_providers()[0]
            logger.info(
                f"Loaded model: {self.model_path.name} | "
                f"Provider: {active_provider} | "
                f"Input: {self.input_size}"
            )
        except Exception as e:
            logger.error(f"Failed to load model {self.model_path}: {e}")
            self.session = None

    def preprocess(self, frame: np.ndarray) -> Tuple[np.ndarray, float, float, int, int]:
        """
        Preprocess frame for YOLO inference.
        Returns: (blob, scale_x, scale_y, pad_w, pad_h)
        """
        h, w = frame.shape[:2]
        target_w, target_h = self.input_size

        # Letterbox resize
        scale = min(target_w / w, target_h / h)
        new_w, new_h = int(w * scale), int(h * scale)
        pad_w = (target_w - new_w) // 2
        pad_h = (target_h - new_h) // 2

        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        padded = np.full((target_h, target_w, 3), 114, dtype=np.uint8)
        padded[pad_h:pad_h + new_h, pad_w:pad_w + new_w] = resized

        # Normalize and transpose: HWC -> CHW, BGR -> RGB
        blob = padded[:, :, ::-1].astype(np.float32) / 255.0
        blob = blob.transpose(2, 0, 1)
        blob = np.expand_dims(blob, axis=0)

        return blob, scale, scale, pad_w, pad_h

    def postprocess(
        self,
        outputs: np.ndarray,
        original_shape: Tuple[int, int],
        scale: float,
        pad_w: int,
        pad_h: int,
    ) -> List[Dict[str, Any]]:
        """
        Postprocess YOLO outputs into detection dictionaries.
        Handles YOLOv8 output format: [batch, num_classes+4, num_detections]
        """
        detections = []

        if outputs is None or len(outputs) == 0:
            return detections

        # YOLOv8 output: [1, 4+num_classes, N] → transpose to [N, 4+num_classes]
        output = outputs[0]
        if output.ndim == 3:
            output = output[0]
        if output.shape[0] < output.shape[1]:
            output = output.T

        h_orig, w_orig = original_shape

        boxes = []
        scores = []
        class_ids = []

        for detection in output:
            # First 4 values: cx, cy, w, h
            cx, cy, bw, bh = detection[:4]
            class_scores = detection[4:]
            class_id = int(np.argmax(class_scores))
            confidence = float(class_scores[class_id])

            if confidence < self.confidence_threshold:
                continue

            # Convert from letterbox coords to original image coords
            x1 = (cx - bw / 2 - pad_w) / scale
            y1 = (cy - bh / 2 - pad_h) / scale
            x2 = (cx + bw / 2 - pad_w) / scale
            y2 = (cy + bh / 2 - pad_h) / scale

            # Clip to image bounds
            x1 = max(0, min(x1, w_orig))
            y1 = max(0, min(y1, h_orig))
            x2 = max(0, min(x2, w_orig))
            y2 = max(0, min(y2, h_orig))

            boxes.append([int(x1), int(y1), int(x2 - x1), int(y2 - y1)])
            scores.append(confidence)
            class_ids.append(class_id)

        if not boxes:
            return detections

        # Apply NMS
        indices = cv2.dnn.NMSBoxes(boxes, scores, self.confidence_threshold, self.nms_threshold)

        if len(indices) > 0:
            if isinstance(indices, np.ndarray):
                indices = indices.flatten()
            for i in indices:
                x, y, w, h = boxes[i]
                detections.append({
                    "bbox": [x, y, x + w, y + h],  # x1, y1, x2, y2
                    "confidence": round(scores[i], 4),
                    "class_id": class_ids[i],
                    "class_name": self.classes.get(class_ids[i], f"class_{class_ids[i]}"),
                })

        return detections

    def infer(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Run full inference pipeline: preprocess → infer → postprocess.
        Returns list of detection dicts with bbox, confidence, class_id, class_name.
        """
        if self.session is None:
            return self._mock_detections(frame)

        h, w = frame.shape[:2]
        blob, scale_x, scale_y, pad_w, pad_h = self.preprocess(frame)

        start = time.perf_counter()
        outputs = self.session.run(self.output_names, {self.input_name: blob})
        inference_ms = (time.perf_counter() - start) * 1000

        detections = self.postprocess(outputs[0] if outputs else None, (h, w), scale_x, pad_w, pad_h)

        for det in detections:
            det["inference_ms"] = round(inference_ms, 2)

        return detections

    def warmup(self, n_frames: int = 3):
        """Run warmup inference with dummy data."""
        if self.session is None:
            self._warmup_done = True
            return

        dummy = np.random.randint(0, 255, (*self.input_size[::-1], 3), dtype=np.uint8)
        for _ in range(n_frames):
            self.infer(dummy)
        self._warmup_done = True
        logger.info(f"Warmup complete for {self.model_path.name} ({n_frames} frames)")

    def _mock_detections(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Generate mock detections when model is not available."""
        import random
        h, w = frame.shape[:2]

        if not self.classes or random.random() > 0.3:
            return []

        n = random.randint(1, 3)
        detections = []
        for _ in range(n):
            class_id = random.choice(list(self.classes.keys()))
            x1 = random.randint(0, w - 100)
            y1 = random.randint(0, h - 100)
            x2 = x1 + random.randint(40, 150)
            y2 = y1 + random.randint(40, 150)
            detections.append({
                "bbox": [x1, y1, min(x2, w), min(y2, h)],
                "confidence": round(random.uniform(0.5, 0.95), 4),
                "class_id": class_id,
                "class_name": self.classes[class_id],
                "inference_ms": round(random.uniform(10, 40), 2),
            })
        return detections


class OCREngine:
    """
    ONNX-based OCR engine for license plate text extraction.
    Uses CTC-decoded character recognition.
    """

    def __init__(
        self,
        model_path: str,
        input_height: int = 48,
        input_width: int = 168,
        charset: str = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        device: str = "cuda",
    ):
        self.model_path = Path(model_path)
        self.input_height = input_height
        self.input_width = input_width
        self.charset = " " + charset  # Blank character for CTC at index 0
        self.device = device
        self.session = None

        self._load_model()

    def _load_model(self):
        """Load OCR ONNX model."""
        if ort is None or not self.model_path.exists():
            logger.warning(f"OCR model not found: {self.model_path}. Using mock OCR.")
            return

        providers = []
        if self.device == "cuda":
            providers.append("CUDAExecutionProvider")
        providers.append("CPUExecutionProvider")

        try:
            self.session = ort.InferenceSession(str(self.model_path), providers=providers)
            logger.info(f"Loaded OCR model: {self.model_path.name}")
        except Exception as e:
            logger.error(f"Failed to load OCR model: {e}")

    def preprocess_plate(self, plate_img: np.ndarray) -> np.ndarray:
        """Preprocess plate crop for OCR."""
        gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY) if len(plate_img.shape) == 3 else plate_img
        resized = cv2.resize(gray, (self.input_width, self.input_height))
        normalized = resized.astype(np.float32) / 255.0
        blob = normalized[np.newaxis, np.newaxis, :, :]  # [1, 1, H, W]
        return blob

    def ctc_decode(self, predictions: np.ndarray) -> Tuple[str, float]:
        """CTC greedy decode: collapse repeated characters and remove blanks."""
        indices = np.argmax(predictions[0], axis=-1)
        confidences = np.max(predictions[0], axis=-1)

        chars = []
        char_confs = []
        prev_idx = -1

        for i, idx in enumerate(indices):
            if idx != 0 and idx != prev_idx:  # Skip blank (0) and repeats
                if idx < len(self.charset):
                    chars.append(self.charset[idx])
                    char_confs.append(float(confidences[i]))
            prev_idx = idx

        text = "".join(chars)
        avg_confidence = float(np.mean(char_confs)) if char_confs else 0.0

        return text, round(avg_confidence, 4)

    def recognize(self, plate_img: np.ndarray) -> Tuple[str, float]:
        """
        Run OCR on a plate image crop.
        Returns: (plate_text, confidence)
        """
        if self.session is None:
            return self._mock_ocr()

        blob = self.preprocess_plate(plate_img)
        input_name = self.session.get_inputs()[0].name
        outputs = self.session.run(None, {input_name: blob})
        text, confidence = self.ctc_decode(outputs[0])
        return text, confidence

    def _mock_ocr(self) -> Tuple[str, float]:
        """Generate mock plate text when model unavailable."""
        import random
        prefixes = ["TS09", "TS07", "AP39", "KA05", "TS10"]
        prefix = random.choice(prefixes)
        letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
        mid = random.choice(letters) + random.choice(letters)
        num = str(random.randint(1000, 9999))
        confidence = round(random.uniform(0.60, 0.95), 2)
        return f"{prefix}{mid}{num}", confidence
