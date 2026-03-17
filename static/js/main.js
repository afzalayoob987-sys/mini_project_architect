import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
// THREE.JS ENGINE SETUP
// ─────────────────────────────────────────────────────────────────────────────
const container = document.getElementById('threejs-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010409);
scene.fog = new THREE.Fog(0x010409, 30, 80);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);
camera.position.set(15, 12, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = true;
controls.minDistance = 3;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI / 2.05;

// ── Lighting ──────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffeedd, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.4);
sunLight.position.set(10, 18, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 100;
sunLight.shadow.camera.left = -25;
sunLight.shadow.camera.right = 25;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xacd8e8, 0.4);
fillLight.position.set(-8, 6, -8);
scene.add(fillLight);

// ── Grid ──────────────────────────────────────────────────────────────────────
const gridHelper = new THREE.GridHelper(60, 60, 0x1e293b, 0x0f172a);
scene.add(gridHelper);

const gltfLoader = new GLTFLoader();

// ─────────────────────────────────────────────────────────────────────────────
// PBR MATERIAL PRESETS
// ─────────────────────────────────────────────────────────────────────────────
const MATERIAL_PRESETS = {
    default: {
        wall:    { color: 0xd1d5db, roughness: 0.6, metalness: 0.05 },
        floor:   { color: 0x94a3b8, roughness: 0.8, metalness: 0.0  },
        ceiling: { color: 0xf1f5f9, roughness: 0.7, metalness: 0.0  },
        roof:    { color: 0x64748b, roughness: 0.5, metalness: 0.1  }
    },
    wood: {
        wall:    { color: 0x92400e, roughness: 0.85, metalness: 0.0 },
        floor:   { color: 0x78350f, roughness: 0.9,  metalness: 0.0 },
        ceiling: { color: 0xfef3c7, roughness: 0.7,  metalness: 0.0 },
        roof:    { color: 0x57534e, roughness: 0.8,  metalness: 0.0 }
    },
    marble: {
        wall:    { color: 0xf8fafc, roughness: 0.05, metalness: 0.4 },
        floor:   { color: 0xe2e8f0, roughness: 0.08, metalness: 0.3 },
        ceiling: { color: 0xffffff, roughness: 0.1,  metalness: 0.2 },
        roof:    { color: 0xcbd5e1, roughness: 0.1,  metalness: 0.3 }
    },
    minimalist: {
        wall:    { color: 0xfafafa, roughness: 0.5,  metalness: 0.0 },
        floor:   { color: 0xe2e8f0, roughness: 0.6,  metalness: 0.0 },
        ceiling: { color: 0xffffff, roughness: 0.5,  metalness: 0.0 },
        roof:    { color: 0xf1f5f9, roughness: 0.4,  metalness: 0.05 }
    },
    modern: {
        wall:    { color: 0x334155, roughness: 0.1, metalness: 0.7 },
        floor:   { color: 0x1e293b, roughness: 0.2, metalness: 0.5 },
        ceiling: { color: 0xf8fafc, roughness: 0.3, metalness: 0.1 },
        roof:    { color: 0x0f172a, roughness: 0.1, metalness: 0.8 }
    },
    luxury: {
        wall:    { color: 0xd4af37, roughness: 0.1, metalness: 0.9 },
        floor:   { color: 0x1c1917, roughness: 0.15, metalness: 0.3 },
        ceiling: { color: 0xfef9c3, roughness: 0.1, metalness: 0.4 },
        roof:    { color: 0x92400e, roughness: 0.2, metalness: 0.6 }
    }
};

function getMat(preset, part) {
    const p = MATERIAL_PRESETS[preset] || MATERIAL_PRESETS.default;
    const cfg = p[part] || p.wall;
    return new THREE.MeshStandardMaterial({ color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness });
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let sceneGroup = new THREE.Group();
scene.add(sceneGroup);
let parsedPlan = null;
let currentFile = null;
let accessCode = null;

function updateStatus(text) {
    const label = document.getElementById('status-label');
    if (label) label.innerText = text;
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK HOUSE (used when no floor plan is uploaded)
// ─────────────────────────────────────────────────────────────────────────────
function buildFallbackHouse(preset = 'modern') {
    clearScene();
    const wallMat = getMat(preset, 'wall');
    const floorMat = getMat(preset, 'floor');
    const roofMat = getMat(preset, 'roof');

    // Base
    addMesh(sceneGroup, new THREE.BoxGeometry(12, 0.3, 12), floorMat, 0, 0.15, 0);
    // Walls
    addMesh(sceneGroup, new THREE.BoxGeometry(12, 4, 0.3), wallMat, 0, 2.15, -6);
    addMesh(sceneGroup, new THREE.BoxGeometry(12, 4, 0.3), wallMat, 0, 2.15,  6);
    addMesh(sceneGroup, new THREE.BoxGeometry(0.3, 4, 12), wallMat, -6, 2.15, 0);
    addMesh(sceneGroup, new THREE.BoxGeometry(0.3, 4, 12), wallMat,  6, 2.15, 0);
    // Roof
    addMesh(sceneGroup, new THREE.BoxGeometry(13, 0.35, 13), roofMat, 0, 4.35, 0);
    // Interior light
    const iLight = new THREE.PointLight(0xfff0d0, 3, 14);
    iLight.position.set(0, 3, 0);
    sceneGroup.add(iLight);
    updateStatus('Status: Default model – upload a floor plan to generate from your design');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCENE BUILDER — data-driven from /api/parse_plan response
// ─────────────────────────────────────────────────────────────────────────────
function buildSceneFromPlan(planData, stylePreset = 'default') {
    clearScene();
    updateStatus('Building 3D scene…');

    const { rooms, walls, outer_bounds } = planData;
    const WALL_H  = 3.2;   // metres
    const WALL_T  = 0.25;  // wall thickness
    const FLOOR_Y = 0.0;

    // ── Ground plane ──────────────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2e1a, roughness: 0.9, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    sceneGroup.add(ground);

    // ── Floor slab ────────────────────────────────────────────────────────────
    const floorW = (outer_bounds?.w || 12) + 1.0;
    const floorD = (outer_bounds?.d || 10) + 1.0;
    const floorSlab = addMesh(sceneGroup,
        new THREE.BoxGeometry(floorW, 0.2, floorD),
        getMat(stylePreset, 'floor'), 0, 0.1, 0);
    floorSlab.receiveShadow = true;

    // ── Room boxes (walls extruded as box volumes) ─────────────────────────────
    const wallMat = getMat(stylePreset, 'wall');
    rooms.forEach((room, idx) => {
        // Floor for this room
        const rFloor = addMesh(sceneGroup,
            new THREE.BoxGeometry(room.w, 0.05, room.d),
            getMat(stylePreset, 'floor'),
            room.x, 0.23, room.z);
        rFloor.receiveShadow = true;

        // 4 walls
        [[room.w, 0, -(room.d / 2 - WALL_T / 2)],
         [room.w, 0,  (room.d / 2 - WALL_T / 2)],
         [WALL_T, 0, -(room.w / 2 - WALL_T / 2)],
         [WALL_T, 0,  (room.w / 2 - WALL_T / 2)]
        ]; // unused; use wall segments below

        // North / South walls
        createWallBox(sceneGroup, wallMat, room.w, WALL_H, WALL_T,
            room.x, FLOOR_Y + WALL_H / 2, room.z - room.d / 2);
        createWallBox(sceneGroup, wallMat, room.w, WALL_H, WALL_T,
            room.x, FLOOR_Y + WALL_H / 2, room.z + room.d / 2);
        // East / West walls
        createWallBox(sceneGroup, wallMat, WALL_T, WALL_H, room.d,
            room.x - room.w / 2, FLOOR_Y + WALL_H / 2, room.z);
        createWallBox(sceneGroup, wallMat, WALL_T, WALL_H, room.d,
            room.x + room.w / 2, FLOOR_Y + WALL_H / 2, room.z);

        // Ceiling
        addMesh(sceneGroup, new THREE.BoxGeometry(room.w, 0.05, room.d),
            getMat(stylePreset, 'ceiling'),
            room.x, FLOOR_Y + WALL_H, room.z);

        // Room label sign
        addRoomLabel(sceneGroup, room.type, room.x, FLOOR_Y + WALL_H + 0.15, room.z);

        // Interior furnishings
        placeInterior(sceneGroup, room, stylePreset);
    });

    // ── Roof ──────────────────────────────────────────────────────────────────
    addMesh(sceneGroup,
        new THREE.BoxGeometry(floorW + 0.5, 0.35, floorD + 0.5),
        getMat(stylePreset, 'roof'),
        0, FLOOR_Y + WALL_H + 0.35, 0
    );

    // ── Exterior ──────────────────────────────────────────────────────────────
    buildExterior(sceneGroup, outer_bounds || { w: 12, d: 10 }, stylePreset);

    // Interior ambient lighting
    const intLight = new THREE.PointLight(0xfff5d0, 4, 20);
    intLight.position.set(0, WALL_H * 0.6, 0);
    sceneGroup.add(intLight);

    updateStatus(`✓ ${rooms.length} rooms rendered · ${stylePreset} style`);
}

function createWallBox(parent, mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

function addMesh(parent, geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM LABEL (floating coloured panel)
// ─────────────────────────────────────────────────────────────────────────────
const ROOM_COLORS = {
    'Living Room': 0x38bdf8, 'Bedroom': 0xa78bfa, 'Kitchen': 0xfbbf24,
    'Bathroom': 0x34d399, 'Dining Room': 0xf87171, 'Study': 0xfb923c,
    'Hallway': 0x94a3b8, 'Storage': 0x6b7280, 'Room': 0x64748b
};

function addRoomLabel(parent, text, x, y, z) {
    const col = ROOM_COLORS[text] || 0x64748b;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + col.toString(16).padStart(6, '0') + '99';
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.4),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    plane.position.set(x, y, z);
    plane.rotation.x = -Math.PI / 2;
    parent.add(plane);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERIOR ASSET PLACEMENT
// ─────────────────────────────────────────────────────────────────────────────
function placeInterior(parent, room, preset) {
    const { type, x, z, w, d } = room;
    const base = 0.25; // above floor

    switch (type) {
        case 'Bedroom':
            placeBed(parent, x, base, z, preset);
            placeDesk(parent, x + w * 0.3, base, z - d * 0.3, preset);
            placeRug(parent, x, 0.26, z + d * 0.1, Math.min(w, d) * 0.5, preset);
            break;
        case 'Living Room':
            placeSofa(parent, x, base, z + d * 0.25, preset);
            placeCoffeeTable(parent, x, base, z, preset);
            placeTVStand(parent, x, base, z - d * 0.35, preset);
            placeRug(parent, x, 0.26, z + d * 0.1, Math.min(w, d) * 0.6, preset);
            break;
        case 'Kitchen':
            placeCounter(parent, x - w * 0.35, base, z - d * 0.35, w * 0.3, preset);
            placeCounter(parent, x + w * 0.35, base, z - d * 0.35, w * 0.3, preset);
            placeIsland(parent, x, base, z + d * 0.1, preset);
            break;
        case 'Bathroom':
            placeBathtub(parent, x - w * 0.25, base, z - d * 0.25, preset);
            placeToilet(parent, x + w * 0.25, base, z + d * 0.25, preset);
            break;
        case 'Dining Room':
            placeDiningTable(parent, x, base, z, w * 0.5, d * 0.4, preset);
            break;
        case 'Study':
            placeDesk(parent, x, base, z - d * 0.3, preset);
            placeBookshelf(parent, x - w * 0.3, base, z - d * 0.4, preset);
            break;
        default:
            break;
    }
}

// — Furniture primitives ——————————————————————————————————————————————————————

function placeBed(p, x, y, z, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2.2), mat);
    frame.position.set(x, y + 0.175, z);
    frame.castShadow = true;
    p.add(frame);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }));
    headboard.position.set(x, y + 0.55, z - 1.05);
    headboard.castShadow = true;
    p.add(headboard);

    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    pillow.position.set(x, y + 0.4, z - 0.7);
    p.add(pillow);
}

function placeDesk(p, x, y, z, preset) {
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), deskMat);
    top.position.set(x, y + 0.75, z);
    top.castShadow = true;
    p.add(top);
    for (let lx of [-0.55, 0.55]) {
        for (let lz of [-0.25, 0.25]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75),
                new THREE.MeshStandardMaterial({ color: 0x3f3f46 }));
            leg.position.set(x + lx, y + 0.375, z + lz);
            p.add(leg);
        }
    }
    // Monitor
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8, emissive: 0x1e3a5f, emissiveIntensity: 0.3 }));
    screen.position.set(x, y + 1.08, z - 0.22);
    p.add(screen);
}

function placeRug(p, x, y, z, size, preset) {
    const col = preset === 'wood' ? 0x7f1d1d : preset === 'luxury' ? 0x422006 : 0x1e3a5f;
    const rug = new THREE.Mesh(new THREE.BoxGeometry(size, 0.02, size * 0.65),
        new THREE.MeshStandardMaterial({ color: col, roughness: 1.0 }));
    rug.position.set(x, y, z);
    rug.receiveShadow = true;
    p.add(rug);
}

function placeSofa(p, x, y, z, preset) {
    const col = preset === 'luxury' ? 0xd4af37 : 0x334155;
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.8), mat);
    base.position.set(x, y + 0.2, z);
    base.castShadow = true;
    p.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.15), mat);
    back.position.set(x, y + 0.67, z - 0.33);
    back.castShadow = true;
    p.add(back);
    for (let lx of [-0.95, 0.95]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.8), mat);
        arm.position.set(x + lx, y + 0.25, z);
        p.add(arm);
    }
}

function placeCoffeeTable(p, x, y, z, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7, metalness: 0.1 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.55), mat);
    top.position.set(x, y + 0.42, z);
    top.castShadow = true;
    p.add(top);
    for (let lx of [-0.43, 0.43]) {
        for (let lz of [-0.21, 0.21]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42),
                new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.3, metalness: 0.7 }));
            leg.position.set(x + lx, y + 0.21, z + lz);
            p.add(leg);
        }
    }
}

function placeTVStand(p, x, y, z, preset) {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.4, metalness: 0.5 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.4), standMat);
    stand.position.set(x, y + 0.25, z);
    stand.castShadow = true;
    p.add(stand);
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.05, metalness: 0.9, emissive: 0x0c1624, emissiveIntensity: 0.5 }));
    tv.position.set(x, y + 0.92, z + 0.02);
    tv.castShadow = true;
    p.add(tv);
}

function placeCounter(p, x, y, z, len, preset) {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.55), woodMat);
    body.position.set(x, y + 0.45, z);
    body.castShadow = true;
    p.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.06, 0.6), stoneMat);
    top.position.set(x, y + 0.93, z);
    top.castShadow = true;
    p.add(top);
}

function placeIsland(p, x, y, z, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.3, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.6), mat);
    body.position.set(x, y + 0.45, z);
    body.castShadow = true;
    p.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.65),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.05, metalness: 0.4 }));
    top.position.set(x, y + 0.93, z);
    p.add(top);
}

function placeBathtub(p, x, y, z, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.2, metalness: 0.3 });
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 1.6), mat);
    tub.position.set(x, y + 0.225, z);
    tub.castShadow = true;
    p.add(tub);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.35, 1.45),
        new THREE.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.0, metalness: 0.1, transparent: true, opacity: 0.5 }));
    inner.position.set(x, y + 0.33, z);
    p.add(inner);
}

function placeToilet(p, x, y, z, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.35, 16), mat);
    bowl.position.set(x, y + 0.175, z);
    p.add(bowl);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.18), mat);
    tank.position.set(x, y + 0.54, z - 0.21);
    p.add(tank);
}

function placeDiningTable(p, x, y, z, w, d, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6, metalness: 0.1 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), mat);
    top.position.set(x, y + 0.77, z);
    top.castShadow = true;
    p.add(top);
    for (let lx of [-w * 0.42, w * 0.42]) {
        for (let lz of [-d * 0.38, d * 0.38]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.77),
                new THREE.MeshStandardMaterial({ color: 0x57534e }));
            leg.position.set(x + lx, y + 0.385, z + lz);
            p.add(leg);
        }
    }
    // Chairs (4 sides)
    const chairPositions = [
        [x,          z + d * 0.7],
        [x,          z - d * 0.7],
        [x - w * 0.7, z],
        [x + w * 0.7, z],
    ];
    chairPositions.forEach(([cx, cz]) => placeChair(p, cx, y, cz, preset));
}

function placeChair(p, x, y, z, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.8 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), mat);
    seat.position.set(x, y + 0.45, z);
    p.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.05), mat);
    back.position.set(x, y + 0.75, z - 0.2);
    p.add(back);
}

function placeBookshelf(p, x, y, z, preset) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.3), mat);
    frame.position.set(x, y + 0.9, z);
    frame.castShadow = true;
    p.add(frame);
    // Books (colourful spines)
    const bookColors = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7];
    for (let shelf = 0; shelf < 4; shelf++) {
        let bx = x - 0.35;
        for (let bi = 0; bi < 5; bi++) {
            const bw = 0.08 + Math.random() * 0.05;
            const book = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.28, 0.22),
                new THREE.MeshStandardMaterial({ color: bookColors[bi % 5] }));
            book.position.set(bx + bw / 2, y + 0.35 + shelf * 0.42, z);
            p.add(book);
            bx += bw + 0.01;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTERIOR — garden, driveway, car
// ─────────────────────────────────────────────────────────────────────────────
function buildExterior(parent, outerBounds, preset) {
    const hw = outerBounds.w / 2;
    const hd = outerBounds.d / 2;
    const gardenCol = preset === 'luxury' ? 0x166534 : 0x15803d;
    const gardenMat = new THREE.MeshStandardMaterial({ color: gardenCol, roughness: 1.0 });
    const pathMat   = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.7 });
    const driveMat  = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5 });

    // Front garden strip
    addMesh(parent, new THREE.BoxGeometry(outerBounds.w + 8, 0.1, 5), gardenMat, 0, 0.05, hd + 2.5);
    // Back garden strip
    addMesh(parent, new THREE.BoxGeometry(outerBounds.w + 8, 0.1, 4), gardenMat, 0, 0.05, -(hd + 2));
    // Side gardens
    addMesh(parent, new THREE.BoxGeometry(4, 0.1, outerBounds.d + 8), gardenMat, hw + 2, 0.05, 0);
    addMesh(parent, new THREE.BoxGeometry(4, 0.1, outerBounds.d + 8), gardenMat, -(hw + 2), 0.05, 0);

    // Driveway / car porch (right side)
    addMesh(parent, new THREE.BoxGeometry(4.5, 0.12, 8), driveMat, hw + 4.25, 0.06, hd - 2);

    // Garden path (front centre)
    addMesh(parent, new THREE.BoxGeometry(1.2, 0.11, 5), pathMat, 0, 0.055, hd + 2.5);

    // Trees (6 around garden)
    const treePositions = [
        [-hw - 1, hd + 1.5], [hw + 1, hd + 1.5],
        [-hw - 1, -(hd + 1)], [hw + 1, -(hd + 1)],
        [-hw - 3, 0], [hw + 3, hd - 1]
    ];
    treePositions.forEach(([tx, tz]) => addTree(parent, tx, 0, tz));

    // Car on driveway
    addCar(parent, hw + 4.25, 0.12, hd - 2.5, preset);

    // Streetlamp
    addStreetlamp(parent, -hw - 1.5, 0, hd + 4.5);

    // Fence / boundary wall
    buildBoundary(parent, hw, hd, preset);
}

function addTree(parent, x, y, z) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b3f26, roughness: 0.9 });
    const leafMat  = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.95 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.5), trunkMat);
    trunk.position.set(x, y + 0.75, z);
    trunk.castShadow = true;
    parent.add(trunk);
    const canopy1 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.8, 8), leafMat);
    canopy1.position.set(x, y + 2.4, z);
    canopy1.castShadow = true;
    parent.add(canopy1);
    const canopy2 = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 8), leafMat);
    canopy2.position.set(x, y + 3.3, z);
    parent.add(canopy2);
}

function addCar(parent, x, y, z, preset) {
    const bodyCol = preset === 'luxury' ? 0x1c1917 : preset === 'modern' ? 0x334155 : 0x1d4ed8;
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.2, metalness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.3 });
    const tyreMat  = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const rimMat   = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.9 });

    const carGroup = new THREE.Group();
    carGroup.position.set(x, y, z);
    parent.add(carGroup);

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.9), bodyMat);
    body.position.set(0, 0.55, 0);
    body.castShadow = true;
    carGroup.add(body);
    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 1.75), bodyMat);
    cabin.position.set(-0.2, 1.22, 0);
    cabin.castShadow = true;
    carGroup.add(cabin);
    // Windshield
    const wind = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.65), glassMat);
    wind.position.set(1.28, 1.2, 0);
    carGroup.add(wind);
    // Rear glass
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.65), glassMat);
    rear.position.set(-1.68, 1.2, 0);
    carGroup.add(rear);

    // Wheels (4)
    const wheelPositions = [[1.4, 0, 1.0], [1.4, 0, -1.0], [-1.4, 0, 1.0], [-1.4, 0, -1.0]];
    wheelPositions.forEach(([wx, wy, wz]) => {
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), tyreMat);
        tyre.rotation.z = Math.PI / 2;
        tyre.position.set(wx, wy + 0.34, wz);
        tyre.castShadow = true;
        carGroup.add(tyre);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.23, 8), rimMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.set(wx, wy + 0.34, wz);
        carGroup.add(rim);
    });

    // Headlights
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 1.5 });
    const headlightPosns = [[2.12, 0.55, 0.62], [2.12, 0.55, -0.62]];
    headlightPosns.forEach(([hx, hy, hz]) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.25), hlMat);
        hl.position.set(hx, hy, hz);
        carGroup.add(hl);
    });
}

function addStreetlamp(parent, x, y, z) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6, metalness: 0.7 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.0), poleMat);
    pole.position.set(x, y + 2.5, z);
    pole.castShadow = true;
    parent.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), poleMat);
    arm.position.set(x + 0.4, y + 5.05, z);
    parent.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 2 }));
    head.position.set(x + 0.8, y + 5.0, z);
    parent.add(head);
    const lampLight = new THREE.PointLight(0xfff9c3, 1.5, 10);
    lampLight.position.set(x + 0.8, y + 4.8, z);
    parent.add(lampLight);
}

function buildBoundary(parent, hw, hd, preset) {
    const fenceMat = new THREE.MeshStandardMaterial({ color: preset === 'luxury' ? 0xd4af37 : 0x6b7280, roughness: 0.5, metalness: 0.3 });
    const h = 0.8, t = 0.1;
    const offX = hw + 4.5, offZ = hd + 4.5;
    // Front & back
    addMesh(parent, new THREE.BoxGeometry(offX * 2, h, t), fenceMat, 0, h / 2, offZ);
    addMesh(parent, new THREE.BoxGeometry(offX * 2, h, t), fenceMat, 0, h / 2, -offZ);
    // Sides
    addMesh(parent, new THREE.BoxGeometry(t, h, offZ * 2), fenceMat, offX, h / 2, 0);
    addMesh(parent, new THREE.BoxGeometry(t, h, offZ * 2), fenceMat, -offX, h / 2, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR SCENE
// ─────────────────────────────────────────────────────────────────────────────
function clearScene() {
    while (sceneGroup.children.length > 0) {
        const child = sceneGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
        sceneGroup.remove(child);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECT VIEW LOGIC
// ─────────────────────────────────────────────────────────────────────────────
if (window.VIEW_TYPE === 'architect') {
    const startCameraBtn   = document.getElementById('start-camera-btn');
    const fileUpload       = document.getElementById('file-upload');
    const generateCodeBtn  = document.getElementById('generate-code-btn');
    const generateBtn3D    = document.getElementById('generate-3d-btn');
    const stylePromptInput = document.getElementById('style-prompt-input');
    const notificationPanel= document.getElementById('notification-panel');
    const planPreviewImg   = document.getElementById('plan-preview-img');
    const parseProgressBar = document.getElementById('parse-progress');
    const aiStatusMsg      = document.getElementById('ai-status-msg');
    const aiResultText     = document.getElementById('ai-result-text');

    // Show fallback on load
    buildFallbackHouse('modern');

    // ── Camera Scan ──────────────────────────────────────────────────────────
    startCameraBtn?.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.getElementById('camera-video');
            video.srcObject = stream;
            document.getElementById('camera-stream-container').classList.remove('hidden');
            updateStatus('Scanning plan surface…');
            setTimeout(() => {
                // Camera scan: use fallback plan layout
                parsedPlan = null;
                currentFile = 'camera_scan';
                generateCodeBtn.disabled = false;
                if (generateBtn3D) generateBtn3D.disabled = false;
                updateStatus('Plan scanned — enter style prompt to generate 3D');
            }, 3000);
        } catch (err) {
            updateStatus('Camera access denied');
        }
    });

    // ── File Upload ──────────────────────────────────────────────────────────
    fileUpload?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        updateStatus(`Uploading ${file.name}…`);
        showProgress(true);

        const formData = new FormData();
        formData.append('file', file);

        try {
            // 1. Upload
            const upRes  = await fetch('/api/upload', { method: 'POST', body: formData });
            const upData = await upRes.json();
            if (!upData.success) throw new Error('Upload failed');

            currentFile = upData.filename;
            updateStatus(`Parsing floor plan…`);
            showProgress(true, 40);

            // Show thumbnail
            if (planPreviewImg) {
                planPreviewImg.src  = `/static/uploads/${currentFile}`;
                planPreviewImg.classList.remove('hidden');
            }

            // 2. Parse
            const parseRes  = await fetch('/api/parse_plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: currentFile })
            });
            const parseData = await parseRes.json();

            showProgress(true, 80);

            if (parseData.success) {
                parsedPlan = parseData.plan_data;
                generateCodeBtn.disabled = false;
                if (generateBtn3D) generateBtn3D.disabled = false;
                showProgress(true, 100);
                setTimeout(() => showProgress(false), 600);
                updateStatus(`✓ Plan parsed — ${parsedPlan.room_count} rooms detected. Enter style prompt → Generate 3D`);
                showToast(`Floor plan parsed: ${parsedPlan.room_count} rooms detected`);
            } else {
                throw new Error(parseData.error);
            }
        } catch (err) {
            console.error(err);
            showProgress(false);
            updateStatus(`Parse error: ${err.message}`);
        }
    });

    // ── Generate 3D ──────────────────────────────────────────────────────────
    generateBtn3D?.addEventListener('click', async () => {
        const prompt = stylePromptInput?.value?.trim() || '';
        if (!prompt) {
            updateStatus('Please enter a style prompt first');
            showToast('Enter a style prompt to generate the 3D scene');
            return;
        }
        if (!parsedPlan && currentFile !== 'camera_scan') {
            updateStatus('Please upload a floor plan first');
            return;
        }

        generateBtn3D.disabled = true;
        generateBtn3D.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating…';
        updateStatus('Sending to AI pipeline…');

        const planPayload = parsedPlan || {
            rooms: [
                { type: 'Living Room', x: -2.5, z: -2.0, w: 5.0, d: 4.0 },
                { type: 'Bedroom',     x:  2.5, z: -2.0, w: 4.0, d: 4.0 },
                { type: 'Kitchen',     x: -2.5, z:  2.5, w: 5.0, d: 3.0 },
                { type: 'Bathroom',    x:  2.5, z:  2.5, w: 4.0, d: 3.0 },
            ],
            outer_bounds: { w: 10, d: 8 },
            room_count: 4
        };

        try {
            const res  = await fetch('/api/generate_3d', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan_data: planPayload,
                    style_prompt: prompt,
                    access_code: accessCode || ''
                })
            });
            const data = await res.json();

            if (data.success) {
                // Show AI status
                if (aiStatusMsg) aiStatusMsg.classList.remove('hidden');
                if (aiResultText) aiResultText.innerText = data.message;

                // Simulate brief AI render delay then build scene
                setTimeout(() => {
                    buildSceneFromPlan(planPayload, data.material_preset || 'default');
                    showToast(`3D scene generated · ${data.material_preset} style`);
                }, 600);
            } else {
                throw new Error(data.error || 'Generation failed');
            }
        } catch (err) {
            console.error(err);
            updateStatus(`Generation error: ${err.message}`);
        } finally {
            setTimeout(() => {
                generateBtn3D.disabled = false;
                generateBtn3D.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Generate 3D Model';
            }, 1800);
        }
    });

    // ── PROJ code ─────────────────────────────────────────────────────────────
    generateCodeBtn?.addEventListener('click', async () => {
        try {
            const res  = await fetch('/api/generate_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: currentFile || 'camera_scan' })
            });
            const data = await res.json();
            if (data.success) {
                accessCode = data.access_code;
                document.getElementById('access-code-display').classList.remove('hidden');
                document.getElementById('result-code').innerText = data.access_code;
                updateStatus(`Generated: ${data.access_code}`);
            }
        } catch (err) { console.error(err); }
    });

    // ── Notification polling ──────────────────────────────────────────────────
    setInterval(async () => {
        try {
            const res  = await fetch('/api/notifications');
            const data = await res.json();
            if (data.success && data.notifications.length > 0) {
                notificationPanel.innerHTML = data.notifications.map(n => `
                    <div class="notification-item p-2 border-bottom border-secondary small">
                        <span class="text-info fw-bold">${n.project}</span>
                        <div class="text-light">${n.text}</div>
                        <div class="text-muted" style="font-size:0.75em">${n.time}</div>
                    </div>
                `).join('');
            }
        } catch (err) { console.error(err); }
    }, 5000);

    // ── Helpers ───────────────────────────────────────────────────────────────
    function showProgress(visible, percent = 0) {
        if (!parseProgressBar) return;
        parseProgressBar.classList.toggle('hidden', !visible);
        const bar = parseProgressBar.querySelector('.progress-bar');
        if (bar) bar.style.width = percent + '%';
    }

    function showToast(message) {
        const toastEl  = document.getElementById('ai-toast');
        const toastMsg = document.getElementById('toast-message');
        if (toastEl && toastMsg && window.bootstrap) {
            toastMsg.innerText = message;
            new bootstrap.Toast(toastEl).show();
        }
    }

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT VIEW LOGIC
// ─────────────────────────────────────────────────────────────────────────────
} else if (window.VIEW_TYPE === 'client') {
    const feedbackInput  = document.getElementById('feedback-input');
    const sendFeedbackBtn= document.getElementById('send-feedback-btn');
    const feedbackStatus = document.getElementById('feedback-status');

    updateStatus(`Syncing with Project: ${window.PROJECT_CODE}…`);
    setTimeout(() => {
        buildFallbackHouse('modern');
        updateStatus(`Connected: ${window.PROJECT_CODE}`);
    }, 1500);

    sendFeedbackBtn?.addEventListener('click', async () => {
        const text = feedbackInput.value;
        if (!text) return;
        try {
            const res  = await fetch('/api/comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_code: window.PROJECT_CODE, text })
            });
            const data = await res.json();
            if (data.success) {
                feedbackInput.value = '';
                feedbackStatus.classList.remove('hidden');
                setTimeout(() => feedbackStatus.classList.add('hidden'), 4000);
            }
        } catch (err) { console.error(err); }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER LOOP
// ─────────────────────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

animate();
