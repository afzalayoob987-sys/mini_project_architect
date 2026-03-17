# Arc-3D Architectural Model Generator Prototype

A web-based 3D Architectural Model Generator prototype. This project allows users to simulate 2D plan scanning via camera or file upload, and then interact with a generated 3D model using AI prompts.

## Features
- **3D Rendering**: Powered by Three.js with orbit controls.
- **Camera Scanning (Simulated)**: Accesses your webcam to simulate real-time plan scanning.
- **File Upload**: Upload .jpg, .png, or .pdf plans.
- **AI Prompt Center**: Interact with the model via text commands (e.g., "Change color to red", "Scale up", "Rotate").

## Prerequisites
- Python 3.9+
- Modern Web Browser (Chrome/Edge recommended for camera support)

## Setup & Running
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the application:
   ```bash
   python app.py
   ```
3. Open in browser:
   Navigate to `http://127.0.0.1:5000`

## Keywords for Prompt Input
- Colors: `red`, `blue`, `green`, `white`, `black`.
- Scale: `scale up`, `scale down`, `bigger`, `smaller`, `tiny`, `large`.
- Rotation: `rotate` (toggles auto-rotation).
