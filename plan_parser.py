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
    
    # ── Parameters ──────────────────────────────────────────────────────────
    PIXELS_TO_METRE = 20.0  # Senior Architect explicit scale
    scale = PIXELS_TO_METRE # Target "Black Pixel Lines" specifically (Senior Architect Refinement)

    # ── 1. Pre-process ────────────────────────────────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Strictly target black pixel lines: 
    # Use adaptive thresholding or simple thresholding with a low value
    _, binary = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)

    # Morphological cleanup to join small gaps in black lines
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    
    # Optional: Skeletonization to get 1-pixel thin lines for precise coordinates
    # For now, we'll use probabilistic Hough Transform for better line detection
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    # Combine edges with our black-line binary mask
    combined = cv2.bitwise_and(edges, binary)

    # ── 2. Line detection → wall segments ────────────────────────────────────
    # High-precision line detection using Probabilistic Hough Transform
    hough_lines = cv2.HoughLinesP(combined, 1, np.pi/180, threshold=50, minLineLength=30, maxLineGap=15)
    
    walls: list = []
    if hough_lines is not None:
        for line in hough_lines:
            x1, y1, x2, y2 = line[0]
            
            # Normalize and scale to scene units
            # We provide a flat array [x1, y1, x2, y2] scaled to meters
            wx1 = round((x1 - w / 2) / scale, 2)
            wz1 = round((y1 - h / 2) / scale, 2)
            wx2 = round((x2 - w / 2) / scale, 2)
            wz2 = round((y2 - h / 2) / scale, 2)
            
            walls.append([wx1, wz1, wx2, wz2])
    else:
        # Fallback logic remains if needed, but refined to flat array
        contours_wall, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        if contours_wall:
            for cnt in contours_wall:
                perimeter = cv2.arcLength(cnt, True)
                if perimeter < 20: continue
                approx = cv2.approxPolyDP(cnt, 0.005 * perimeter, True)
                for i in range(len(approx)):
                    p1 = approx[i][0]
                    p2 = approx[(i+1) % len(approx)][0]
                    wx1 = round((p1[0] - w / 2) / scale, 2)
                    wz1 = round((p1[1] - h / 2) / scale, 2)
                    wx2 = round((p2[0] - w / 2) / scale, 2)
                    wz2 = round((p2[1] - h / 2) / scale, 2)
                    walls.append([wx1, wz1, wx2, wz2])

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
        "room_count": len(rooms),
        "image_size": {"w": w, "h": h},
        "PIXELS_TO_METRE": PIXELS_TO_METRE
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
            {"start": {"x": -5.0, "z": -4.0}, "end": {"x": 5.0, "z": -4.0}, "thickness": 0.25, "height": 3.2},
            {"start": {"x": 5.0, "z": -4.0}, "end": {"x": 5.0, "z": 4.0}, "thickness": 0.25, "height": 3.2},
            {"start": {"x": 5.0, "z": 4.0}, "end": {"x": -5.0, "z": 4.0}, "thickness": 0.25, "height": 3.2},
            {"start": {"x": -5.0, "z": 4.0}, "end": {"x": -5.0, "z": -4.0}, "thickness": 0.25, "height": 3.2},
            {"start": {"x": 0.0, "z": -4.0}, "end": {"x": 0.0, "z": 4.0}, "thickness": 0.15, "height": 3.2},
            {"start": {"x": -5.0, "z": 0.5}, "end": {"x": 5.0, "z": 0.5}, "thickness": 0.15, "height": 3.2},
        ],
        "outer_bounds": {"w": 10.0, "d": 8.0},
        "room_count": 4
    }
