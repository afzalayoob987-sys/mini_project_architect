import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
// THREE.JS ENGINE SETUP
// ─────────────────────────────────────────────────────────────────────────────
const container = document.getElementById('threejs-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Start Dark

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(20, 40, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

const gltfLoader = new GLTFLoader();

// ─────────────────────────────────────────────────────────────────────────────
// STATE & SCENE GROUPS
// ─────────────────────────────────────────────────────────────────────────────
let groupWalls = new THREE.Group();
let groupInterior = new THREE.Group();
let groupExterior = new THREE.Group();
scene.add(groupWalls, groupInterior, groupExterior);

let parsedPlan = null;
let currentMode = 'interior';

function updateStatus(text) {
    const label = document.getElementById('status-label');
    if (label) label.innerText = text;
}

function clearScene() {
    [groupWalls, groupInterior, groupExterior].forEach(g => {
        while (g.children.length > 0) {
            const child = g.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
            g.remove(child);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────────────────────────────────────
async function generate3DModel(data) {
    updateStatus("STATUS: ASSEMBLING ARCHITECTURAL PLAN...");
    const payload = data || parsedPlan;
    if (!payload?.walls) return updateStatus("ERROR: NO PLAN DATA");
    build3DScene(payload);
    switchView('interior'); // Default to interior for presentation
}

function build3DScene(planData) {
    clearScene();

    // 1. EXTERIOR CONTEXT (Grass)
    const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000),
        new THREE.MeshStandardMaterial({ color: 0x4d9c4d, roughness: 1.0 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    grass.receiveShadow = true;
    groupExterior.add(grass);

    // 2. INTERIOR CONTEXT (Floor)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    groupInterior.add(floor);

    const SCALE = 1.5;
    const WALL_H = 3.5;
    const WALL_T = 0.25;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 });

    // 3. WALLS & WINDOWS (Shared)
    planData.walls.forEach(w => {
        let x1, z1, x2, z2;
        if (Array.isArray(w)) [x1, z1, x2, z2] = w;
        else { x1 = w.start.x; z1 = w.start.z; x2 = w.end.x; z2 = w.end.z; }
        const sx1 = x1 * SCALE, sz1 = z1 * SCALE, sx2 = x2 * SCALE, sz2 = z2 * SCALE;
        const dx = sx2 - sx1, dz = sz2 - sz1;
        const length = Math.sqrt(dx * dx + dz * dz) || 0.1, angle = Math.atan2(dz, dx);

        if (length > 2.0) {
            const sideLen = length * 0.35, winLen = length * 0.3;
            // Wall portions
            const w1 = createBox(sideLen, WALL_H, WALL_T, wallMat);
            w1.position.set(sx1 + dx * 0.175, WALL_H / 2, sz1 + dz * 0.175);
            w1.rotation.y = -angle;
            groupWalls.add(w1);

            const w2 = createBox(sideLen, WALL_H, WALL_T, wallMat);
            w2.position.set(sx1 + dx * 0.825, WALL_H / 2, sz1 + dz * 0.825);
            w2.rotation.y = -angle;
            groupWalls.add(w2);

            // Window Pane
            const win = createBox(winLen, WALL_H * 0.5, WALL_T * 0.7, glassMat);
            win.position.set(sx1 + dx * 0.5, WALL_H * 0.6, sz1 + dz * 0.5);
            win.rotation.y = -angle;
            groupWalls.add(win);
        } else {
            const wall = createBox(length, WALL_H, WALL_T, wallMat);
            wall.position.set((sx1 + sx2) / 2, WALL_H / 2, (sz1 + sz2) / 2);
            wall.rotation.y = -angle;
            groupWalls.add(wall);
        }
    });

    // 4. FURNITURE (Interior)
    if (planData.rooms) {
        planData.rooms.forEach(room => {
            const rx = room.x * SCALE, rz = room.z * SCALE;
            spawnFurniture(room.type, rx, rz, groupInterior);
        });
    }

    // 5. ROOF SLAB (Exterior)
    groupWalls.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(groupWalls);
    const rw = box.max.x - box.min.x + 0.6, rd = box.max.z - box.min.z + 0.6;
    const roof = createBox(rw, 0.2, rd, new THREE.MeshStandardMaterial({ color: 0x777777 }));
    const rCenter = box.getCenter(new THREE.Vector3());
    roof.position.set(rCenter.x, WALL_H + 0.1, rCenter.z);
    groupExterior.add(roof);

    // Centering everything to 0,0,0
    groupWalls.position.set(-rCenter.x, 0, -rCenter.z);
    groupInterior.position.set(-rCenter.x, 0, -rCenter.z);
    groupExterior.position.set(-rCenter.x, 0, -rCenter.z);

    updateStatus('✓ 3D MODEL SYNTHESIZED');
}

function createBox(w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
}

function spawnFurniture(roomType, x, z, group) {
    const type = roomType.toLowerCase();
    let url = '';
    if (type.includes('bedroom')) url = 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/bed/model.gltf';
    else if (type.includes('living')) url = 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/sofa/model.gltf';

    if (url) {
        gltfLoader.load(url, (gltf) => {
            const m = gltf.scene; m.scale.set(1.5, 1.5, 1.5); m.position.set(x, 0, z);
            m.traverse(n => { if (n.isMesh) n.castShadow = true; });
            group.add(m);
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW TOGGLE LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function switchView(mode) {
    currentMode = mode;
    if (mode === 'interior') {
        groupInterior.visible = true;
        groupExterior.visible = false;
        scene.background = new THREE.Color(0x111111);
        document.getElementById('view-interior-btn').style.background = 'rgba(56, 189, 248, 0.2)';
        document.getElementById('view-interior-btn').style.color = '#38bdf8';
        document.getElementById('view-exterior-btn').style.background = 'transparent';
        document.getElementById('view-exterior-btn').style.color = 'rgba(255,255,255,0.5)';
    } else {
        groupInterior.visible = true; // In Exterior, we see the building shell; interior assets can stay or go
        groupExterior.visible = true;
        scene.background = new THREE.Color(0x87ceeb); // Sky Blue
        document.getElementById('view-exterior-btn').style.background = 'rgba(56, 189, 248, 0.2)';
        document.getElementById('view-exterior-btn').style.color = '#38bdf8';
        document.getElementById('view-interior-btn').style.background = 'transparent';
        document.getElementById('view-interior-btn').style.color = 'rgba(255,255,255,0.5)';
    }
}

document.getElementById('view-interior-btn')?.addEventListener('click', () => switchView('interior'));
document.getElementById('view-exterior-btn')?.addEventListener('click', () => switchView('exterior'));

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD ATTACHMENT
// ─────────────────────────────────────────────────────────────────────────────
const fileUpload = document.getElementById('file-upload');
const previewImg = document.getElementById('plan-preview-img');
fileUpload?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { previewImg.src = ev.target.result; previewImg.classList.remove('hidden'); document.getElementById('plan-preview-placeholder')?.classList.add('hidden'); };
    reader.readAsDataURL(file);

    updateStatus(`Parsing ${file.name}…`);
    const fd = new FormData(); fd.append('file', file);
    try {
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const upD = await up.json();
        if (upD.success) {
            const ps = await fetch('/api/parse_plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: upD.filename }) });
            const psD = await ps.json();
            if (psD.success) { parsedPlan = psD.plan_data; document.getElementById('generate-3d-btn').disabled = false; updateStatus(`✓ Plan Parsed.`); }
        }
    } catch (err) { console.error(err); }
});

document.getElementById('generate-3d-btn')?.addEventListener('click', () => generate3DModel(parsedPlan));

function animate() {
    requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight);
});
