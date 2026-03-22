import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
// THREE.JS ENGINE SETUP
// ─────────────────────────────────────────────────────────────────────────────
const container = document.getElementById('threejs-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee); // Light Grey for Presentation

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
camera.position.set(15, 15, 15);
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

// Grid Helper for spatial context
const grid = new THREE.GridHelper(100, 100, 0x000000, 0xcccccc);
grid.position.y = -0.02; // Slightly below floor
scene.add(grid);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 3.5);
sunLight.position.set(40, 60, 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
sunLight.shadow.bias = -0.0001;
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

    // 1. EXTERIOR CONTEXT (Large Scale Plane)
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 1.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    groupExterior.add(ground);

    // 2. INTERIOR CONTEXT (Solid White Floor)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshStandardMaterial({ 
            color: 0xffffff, // Solid White
            roughness: 0.8, 
            metalness: 0.0 
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    groupInterior.add(floor);

    const SCALE = 1.5;
    const WALL_H = 3.5;
    const WALL_T = 0.2; // Original Thickness
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.0
    });

    // 3. WALL RECONSTRUCTION (Direct Line Extrusion)
    // Every line segment from the plan is extruded as a centerline BoxGeometry
    planData.walls.forEach(w => {
        let x1, z1, x2, z2;
        if (Array.isArray(w)) [x1, z1, x2, z2] = w;
        else { x1 = w.start.x; z1 = w.start.z; x2 = w.end.x; z2 = w.end.z; }
        const sx1 = x1 * SCALE, sz1 = z1 * SCALE, sx2 = x2 * SCALE, sz2 = z2 * SCALE;
        const dx = sx2 - sx1, dz = sz2 - sz1;
        const length = Math.sqrt(dx * dx + dz * dz) || 0.1;
        const angle = Math.atan2(dz, dx);

        const wall = createBox(length, WALL_H, WALL_T, wallMat);
        wall.position.set((sx1 + sx2) / 2, WALL_H / 2, (sz1 + sz2) / 2);
        wall.rotation.y = -angle;
        groupWalls.add(wall);
    });

    // NOTE: Room-based "Polygon Fragments" removed as per request for direct line translation.

    // 4. FURNITURE (Interior)
    if (planData.rooms) {
        planData.rooms.forEach(room => {
            const rx = room.x * SCALE, rz = room.z * SCALE;
            spawnFurniture(room.type, rx, rz, groupInterior);
        });
    }

    // 5. CAMERA & FOCUS
    groupWalls.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(groupWalls);
    const rCenter = box.getCenter(new THREE.Vector3());
    
    // Centering everything to 0,0,0
    groupWalls.position.set(-rCenter.x, 0, -rCenter.z);
    groupInterior.position.set(-rCenter.x, 0, -rCenter.z);
    groupExterior.position.set(-rCenter.x, 0, -rCenter.z);

    // Explicit Interior Focus
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();

    updateStatus('✓ 3D MODEL SYNTHESIZED');
}

function createBox(w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
}

function spawnOpening(type, x, y, z, angle, group) {
    let url = type === 'window' ? 
        'https://v1.gltf.pmnd.rs/window/model.gltf' : 
        'https://raw.githubusercontent.com/pmndrs/market-assets/main/models/door-wood/model.gltf';
    
    gltfLoader.load(url, (gltf) => {
        const m = gltf.scene;
        m.position.set(x, y, z);
        m.rotation.y = -angle + Math.PI/2;
        if (type === 'window') m.scale.set(1.2, 1.2, 1.2);
        else m.scale.set(1.4, 1.4, 1.4);
        m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        group.add(m);
    });
}

function spawnFurniture(roomType, x, z, group) {
    const type = roomType.toLowerCase();
    let url = '';
    
    // Enhanced label mapping for furniture
    if (type.includes('bedroom')) {
        url = 'https://v1.gltf.pmnd.rs/bed/model.gltf';
    } else if (type.includes('living') || type.includes('sofa') || type.includes('entrance')) {
        url = 'https://v1.gltf.pmnd.rs/sofa/model.gltf';
    } else if (type.includes('dining')) {
        url = 'https://raw.githubusercontent.com/pmndrs/market-assets/main/models/table-wood/model.gltf';
    } else if (type.includes('kitchen')) {
        url = 'https://raw.githubusercontent.com/pmndrs/market-assets/main/models/refrigerator/model.gltf';
    } else if (type.includes('bath')) {
        // Fallback for bathroom or presentation kitchen counter if needed
        url = 'https://raw.githubusercontent.com/pmndrs/market-assets/main/models/sideboard-white/model.gltf';
    }

    if (url) {
        gltfLoader.load(url, (gltf) => {
            const m = gltf.scene;
            m.scale.set(1.5, 1.5, 1.5);
            m.position.set(x, 0, z);
            
            // Fixed rotation for presentation stability
            m.rotation.y = Math.PI; 
            
            m.traverse(n => { 
                if (n.isMesh) {
                    n.castShadow = true; 
                    n.receiveShadow = true;
                    // Ensure white material look for presentation if possible
                    if (n.material) n.material.color.set(0xffffff);
                } 
            });
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
        scene.background = new THREE.Color(0xeeeeee);
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
