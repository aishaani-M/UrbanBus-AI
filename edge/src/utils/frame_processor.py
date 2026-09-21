"""
UrbanBus Edge AI — Frame Processor

Image preprocessing utilities: ROI extraction, enhancement,
thumbnail generation, and coordinate transforms.
"""

import cv2
import numpy as np
from typing import Tuple, Optional, List, Dict
import base64


def crop_roi(
    frame: np.ndarray,
    bbox: List[int],
    padding: float = 0.1,
) -> np.ndarray:
    """
    Crop a region of interest from frame with optional padding.
    bbox: [x1, y1, x2, y2]
    """
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    bw, bh = x2 - x1, y2 - y1

    # Add padding
    pad_x = int(bw * padding)
    pad_y = int(bh * padding)
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w, x2 + pad_x)
    y2 = min(h, y2 + pad_y)

    return frame[y1:y2, x1:x2].copy()


def enhance_plate_crop(plate_img: np.ndarray) -> np.ndarray:
    """
    Enhance a license plate crop for better OCR.
    Applies perspective correction hints, contrast enhancement, and sharpening.
    """
    if plate_img.size == 0:
        return plate_img

    # Convert to grayscale
    if len(plate_img.shape) == 3:
        gray = cv2.cvtColor(plate_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = plate_img.copy()

    # CLAHE for contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Bilateral filter to reduce noise while keeping edges
    denoised = cv2.bilateralFilter(enhanced, 9, 75, 75)

    # Sharpen
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(denoised, -1, kernel)

    return sharpened


def generate_thumbnail(
    frame: np.ndarray,
    max_dim: int = 320,
    quality: int = 75,
) -> str:
    """
    Generate a compressed JPEG thumbnail and return as base64 string.
    Used for sending event thumbnails over MQTT without full frames.
    """
    h, w = frame.shape[:2]
    scale = max_dim / max(h, w)

    if scale < 1.0:
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    else:
        resized = frame

    _, buffer = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buffer).decode("utf-8")


def draw_detections(
    frame: np.ndarray,
    detections: List[Dict],
    color_map: Optional[Dict[str, Tuple[int, int, int]]] = None,
) -> np.ndarray:
    """
    Draw bounding boxes and labels on frame for visualization.
    """
    annotated = frame.copy()

    default_colors = {
        "pothole": (0, 0, 255),
        "crack": (0, 128, 255),
        "damaged_road": (0, 165, 255),
        "car": (255, 200, 0),
        "truck": (255, 100, 0),
        "bus": (0, 255, 200),
        "two_wheeler": (200, 200, 0),
        "person": (0, 255, 0),
        "child": (0, 255, 255),
    }

    colors = {**(color_map or {}), **default_colors}

    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        cls = det.get("class_name", "unknown")
        conf = det.get("confidence", 0)
        track_id = det.get("track_id")

        color = colors.get(cls, (128, 128, 128))

        # Bounding box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        # Label
        label = f"{cls} {conf:.2f}"
        if track_id is not None:
            label = f"ID:{track_id} {label}"

        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(
            annotated, label, (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1
        )

    return annotated


def compute_iou(box1: List[int], box2: List[int]) -> float:
    """Compute IoU between two boxes [x1, y1, x2, y2]."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter

    return inter / union if union > 0 else 0.0


def bbox_center(bbox: List[int]) -> Tuple[float, float]:
    """Get center point of a bbox [x1, y1, x2, y2]."""
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def bbox_area(bbox: List[int]) -> float:
    """Get area of a bbox [x1, y1, x2, y2]."""
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])
