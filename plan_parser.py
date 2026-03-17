"""
plan_parser.py
OpenCV-based 2D floor plan parser.
Detects walls, rooms and building footprint from an uploaded image.
Returns structured JSON used by the Three.js renderer.
"""

import cv2  # type: ignore  # installed: opencv-python
import numpy as np  # type: ignore  # installed: numpy
import os


def parse_floor_plan(image_path: str) -> dict:
    """
    Parse a floor plan image and return structured plan data.

    Returns:
        {
            "rooms": [{"type": str, "x": float, "z": float, "w": float, "d": float}],
            "walls": [[x1, y1, x2, y2], ...],          # normalised to metres
            "outer_bounds": {"w": float, "d": float},
            "room_count": int
        }
    """
    if not os.path.exists(image_path):
        return _fallback_plan()

    img = cv2.imread(image_path)
    if img is None:
        return _fallback_plan()

    h, w = img.shape[:2]
    scale = 20.0  # pixels → metre scale (20 px ≈ 1 m in the 3-D scene)

    # ── 1. Pre-process ────────────────────────────────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Try to binarise ─ works on both white-bg and dark-bg plans
    _, thresh_inv = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    _, thresh_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Pick whichever has more non-zero pixels (i.e. detects more structure)
    binary = thresh_inv if cv2.countNonZero(thresh_inv) > cv2.countNonZero(thresh_otsu) else thresh_otsu

    # Morphological cleanup
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)

    # ── 2. Edge detection → wall segments ────────────────────────────────────
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)

    # Hough line segments for walls
    lines_raw = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=40,
                             minLineLength=int(min(h, w) * 0.05),
                             maxLineGap=10)
    lines: list = list(lines_raw) if lines_raw is not None else []

    walls: list = []
    if lines:
        for line in lines[:80]:  # type: ignore[index]  # cap at 80 wall segments
            x1, y1, x2, y2 = line[0]
            # Convert to scene units (centre image at origin)
            wx1 = (x1 - w / 2) / scale
            wz1 = (y1 - h / 2) / scale
            wx2 = (x2 - w / 2) / scale
            wz2 = (y2 - h / 2) / scale
            walls.append([round(wx1, 2), round(wz1, 2), round(wx2, 2), round(wz2, 2)])

    # ── 3. Room detection via contours ───────────────────────────────────────
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter noisy tiny blobs; keep areas > 0.5% of image
    min_area = h * w * 0.005
    valid_contours = [c for c in contours if cv2.contourArea(c) > min_area]
    valid_contours = sorted(valid_contours, key=cv2.contourArea, reverse=True)

    # Build room list
    rooms = []
    room_types = _room_type_sequence(len(valid_contours))

    for i, cnt in enumerate(valid_contours[:10]):  # type: ignore[index]  # max 10 rooms
        rect = cv2.boundingRect(cnt)
        rx, ry, rw, rd = rect

        # Convert to scene units (centred)
        scene_x = (rx + rw / 2 - w / 2) / scale
        scene_z = (ry + rd / 2 - h / 2) / scale
        scene_w = rw / scale
        scene_d = rd / scale

        rooms.append({
            "type": room_types[i],
            "x": round(scene_x, 2),
            "z": round(scene_z, 2),
            "w": round(scene_w, 2),
            "d": round(scene_d, 2)
        })

    # ── 4. Outer building footprint ───────────────────────────────────────────
    outer_w = round(w / scale, 2)
    outer_d = round(h / scale, 2)

    # If we have ≥1 room, use the union bounding box of all rooms instead
    if rooms:
        xs = [r["x"] - r["w"] / 2 for r in rooms] + [r["x"] + r["w"] / 2 for r in rooms]
        zs = [r["z"] - r["d"] / 2 for r in rooms] + [r["z"] + r["d"] / 2 for r in rooms]
        outer_w = round(max(xs) - min(xs), 2)
        outer_d = round(max(zs) - min(zs), 2)

    # ── 5. Fallback: if zero rooms detected, use synthetic layout ─────────────
    if not rooms:
        return _fallback_plan()

    return {
        "rooms": rooms,
        "walls": walls,
        "outer_bounds": {"w": outer_w, "d": outer_d},
        "room_count": len(rooms)
    }


def _room_type_sequence(n: int) -> list:
    """
    Heuristic room-type assignment by area rank:
    Largest → Living Room, next → Bedroom(s), then Kitchen, Bathroom, etc.
    """
    sequence: list = [
        "Living Room", "Bedroom", "Kitchen", "Bedroom",
        "Bathroom", "Dining Room", "Study", "Bathroom",
        "Storage", "Hallway"
    ]
    result: list = sequence[:n]  # type: ignore[index]
    return result + ["Room"] * max(0, n - len(sequence))


def _fallback_plan() -> dict:
    """
    Procedural 4-room house layout used when OpenCV cannot parse the image.
    Rooms are placed in a 2×2 grid totalling ~10 × 8 m.
    """
    return {
        "rooms": [
            {"type": "Living Room", "x": -2.5, "z": -2.0, "w": 5.0, "d": 4.0},
            {"type": "Bedroom",     "x":  2.5, "z": -2.0, "w": 4.0, "d": 4.0},
            {"type": "Kitchen",     "x": -2.5, "z":  2.5, "w": 5.0, "d": 3.0},
            {"type": "Bathroom",    "x":  2.5, "z":  2.5, "w": 4.0, "d": 3.0},
        ],
        "walls": [
            [-5.0, -4.0,  5.0, -4.0],  # top
            [ 5.0, -4.0,  5.0,  4.0],  # right
            [ 5.0,  4.0, -5.0,  4.0],  # bottom
            [-5.0,  4.0, -5.0, -4.0],  # left
            [ 0.0, -4.0,  0.0,  4.0],  # centre vertical
            [-5.0,  0.5,  5.0,  0.5],  # centre horizontal
        ],
        "outer_bounds": {"w": 10.0, "d": 8.0},
        "room_count": 4
    }
