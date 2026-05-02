'use strict';
/**
 * ClimVis — Carbon Bubble Visualizer
 * THREE + gsap loaded as globals in index.html
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// CO2 gas density at STP (0 °C, 1 atm) — NIST.
// V = mass / ρ  →  r = ∛(3V / 4π)
const CO2_DENSITY = 1.964; // kg/m³

// Reference objects ordered by height.
// getComparisonTier() picks the LARGEST one still shorter than the bubble radius,
// so the bubble always visually dominates.
// `label` is the grammatically correct phrase used in "Comparable to ___".
const TIERS = [
    { name: 'AA battery',           label: 'an AA battery',                height_m:          0.05 },
    { name: 'Coffee mug',           label: 'a coffee mug',                 height_m:          0.12 },
    { name: 'Cell phone',           label: 'a cell phone',                 height_m:          0.15 },
    { name: 'Adult human',          label: 'an adult human',               height_m:           1.7 },
    { name: 'Tree',                 label: 'a mature tree',                height_m:           5.0 },
    { name: 'House',                label: 'a house',                      height_m:           9.0 },
    { name: 'Big Ben',              label: 'Big Ben',                      height_m:            96 },
    { name: 'Eiffel Tower',         label: 'the Eiffel Tower',             height_m:           330 },
    { name: 'Burj Khalifa',         label: 'the Burj Khalifa',             height_m:           828 },
    { name: 'Mt. Everest',          label: 'Mt. Everest',                  height_m:         8_849 },
    { name: 'Low Earth Orbit',      label: 'Low Earth Orbit altitude',     height_m:       400_000 },
    { name: 'Moon',                 label: "the Moon's diameter",          height_m:     3_474_000 },
    { name: "Earth's diameter",     label: "Earth's diameter",             height_m:    12_742_000 },
    { name: 'Saturn',               label: "Saturn's diameter",            height_m:   120_536_000 },
    { name: 'Jupiter',              label: "Jupiter's diameter",           height_m:   142_984_000 },
    { name: 'Sun',                  label: "the Sun's diameter",           height_m: 1_392_700_000 },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCENE STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let scene, camera, renderer;
let sphereGroup       = null;
let compGroup         = null;
let personGroup       = null;
let currentData       = null;
let sliderTimer       = null;
let useImperial       = false;
let currentStarSphereR = 2e9;

// Camera orbit state — zoomToFit() writes these; render loop reads them each frame.
const cam = { cx: 0, cy: 10, dist: 30, lookY: 4 };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MATH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function co2ToRadius(kg) {
    const vol = kg / CO2_DENSITY;
    return Math.cbrt((3 * vol) / (4 * Math.PI));
}

// Slider goes from 1× (pos=1) to 8.1B× (pos=10) — full human population scale.
const SLIDER_MAX_MULT = 8_100_000_000;
function sliderMultiplier(pos) {
    if (pos <= 1) return 1;
    return Math.round(Math.pow(10, (pos - 1) * Math.log10(SLIDER_MAX_MULT) / 9));
}

function getComparisonTier(co2_kg) {
    const r = co2ToRadius(co2_kg);
    // Keep only objects shorter than the bubble radius so the bubble always
    // towers over the comparison object — that's what makes the scale legible.
    const eligible = TIERS.filter(t => t.height_m < r);
    return eligible.length ? eligible[eligible.length - 1] : TIERS[0];
}

function fmtCO2(kg) {
    if (kg >= 1e12) return `${(kg/1e12).toFixed(2)} Gt CO₂`;
    if (kg >= 1e9)  return `${(kg/1e9 ).toFixed(2)} Mt CO₂`;
    if (kg >= 1e6)  return `${(kg/1e6 ).toFixed(2)} kt CO₂`;
    if (kg >= 1e3)  return `${(kg/1e3 ).toFixed(2)} t CO₂`;
    return `${kg.toFixed(1)} kg CO₂`;
}
function fmtDist(m) {
    if (useImperial) {
        const mi = m / 1609.34, ft = m * 3.28084, ins = m * 39.3701;
        if (m >= 1e9)     return `${(mi/1e6).toFixed(2)}M mi`;
        if (m >= 1e6)     return `${(mi/1e3).toFixed(1)}k mi`;
        if (m >= 1609.34) return `${mi.toFixed(2)} mi`;
        if (m >= 0.3048)  return `${ft.toFixed(1)} ft`;
        return `${ins.toFixed(1)} in`;
    }
    if (m >= 1e9) return `${(m/1e9).toFixed(2)} Gm`;
    if (m >= 1e6) return `${(m/1e6).toFixed(2)} Mm`;
    if (m >= 1e3) return `${(m/1e3).toFixed(1)} km`;
    if (m >= 1)   return `${m.toFixed(1)} m`;
    return `${(m*100).toFixed(0)} cm`;
}
function fmtMult(n) {
    if (n >= 1e9) return `${(n/1e9).toFixed(1)}B×`;
    if (n >= 1e6) return `${(n/1e6).toFixed(1)}M×`;
    if (n >= 1e3) return `${(n/1e3).toFixed(0)}k×`;
    return `${n}×`;
}
function fmtNum(n) {
    if (n >= 1e9) return `${(n/1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n/1e3).toFixed(1)}k`;
    return `${n}`;
}

// Context line shown below the CO₂ number.
// Always describes what THIS TOTAL AMOUNT means — never ambiguous about "per person" vs "total".
function populationContext(co2_kg) {
    const WORLD_POP = 8_100_000_000;
    const WORLD_YR  = 4_500;   // avg kg CO₂ per person per year globally

    if (co2_kg < WORLD_YR * 0.001) {
        const pct = (co2_kg / WORLD_YR * 100).toFixed(3);
        return `${pct}% of one person's entire annual carbon footprint`;
    }
    if (co2_kg < WORLD_YR) {
        const pct = (co2_kg / WORLD_YR * 100).toFixed(1);
        return `${pct}% of one person's entire annual carbon footprint`;
    }
    if (co2_kg < WORLD_YR * 1000) {
        const x = co2_kg / WORLD_YR;
        if (x < 1.15) return `About equal to one person's average annual carbon footprint`;
        const xStr = x < 10 ? x.toFixed(1) : Math.round(x).toString();
        return `${xStr}× the global average annual carbon footprint`;
    }
    if (co2_kg < WORLD_POP * WORLD_YR) {
        const pct = (co2_kg / (WORLD_POP * WORLD_YR) * 100).toFixed(2);
        return `${pct}% of all 8 billion people's combined yearly emissions`;
    }
    const yrs = (co2_kg / (WORLD_POP * WORLD_YR)).toFixed(1);
    return `All 8 billion people on Earth emitting for ${yrs} year${yrs !== '1.0' ? 's' : ''}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GALAXY BAND (fades in at cosmic scale)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildGalaxyBand() {
    const R = 2e9;
    const verts = [], cols = [];

    // Dense Milky Way band — 10 000 points in a great-circle band
    for (let i = 0; i < 10000; i++) {
        const theta = Math.random() * Math.PI * 2;
        // Gaussian latitude spread → creates a realistic uneven band width
        const lat = (Math.random() + Math.random() - 1.0) * 0.14;
        const r   = R * (0.92 + Math.random() * 0.16);
        verts.push(
            r * Math.cos(lat) * Math.cos(theta),
            r * Math.sin(lat),
            r * Math.cos(lat) * Math.sin(theta)
        );
        // Vary colour: mostly blue-white, some warm yellow-white
        const warm = Math.random() < 0.25;
        cols.push(warm ? 1.0 : 0.72, warm ? 0.92 : 0.82, warm ? 0.72 : 1.0);
    }

    // Core bulge — extra-dense cluster toward galactic centre
    for (let i = 0; i < 3000; i++) {
        const theta = (Math.random() - 0.5) * 1.1; // ±63° arc
        const lat   = (Math.random() + Math.random() - 1.0) * 0.30;
        const r     = R * (0.94 + Math.random() * 0.12);
        verts.push(
            r * Math.cos(lat) * Math.cos(theta),
            r * Math.sin(lat),
            r * Math.cos(lat) * Math.sin(theta)
        );
        cols.push(1.0, 0.95, 0.82); // warm core
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(cols,  3));

    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.5, sizeAttenuation: false,
        vertexColors: true,
        depthWrite: false, depthTest: false,
        transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending,
    }));
    pts.rotation.z = Math.PI * 0.32;   // tilt the band ~58° — diagonal streak
    pts.name = 'galaxy';
    pts.renderOrder = -1;
    return pts;
}

// Called by zoomToFit to push stars/galaxy outside the current scene and
// fade the galaxy band in as the bubble reaches cosmic scale.
function updateCosmicBackground(r) {
    const targetR   = Math.max(2e9, r * 6);
    const starScale = targetR / 2e9;
    currentStarSphereR = targetR;

    const starsObj = scene.getObjectByName('stars');
    if (starsObj) starsObj.scale.setScalar(starScale);

    const galObj = scene.getObjectByName('galaxy');
    if (galObj) {
        galObj.scale.setScalar(starScale);
        // Baseline 0.12 always; fades up to 0.72 at galactic scale
        const galT = Math.min(1, Math.max(0, (r - 7e8) / 6.3e9));
        gsap.to(galObj.material, { opacity: 0.12 + galT * 0.60, duration: 1.8, ease: 'power2.inOut' });

        const bg = new THREE.Color(
            0x06 / 255 + galT * (0x0a / 255),
            0x0d / 255 - galT * (0x05 / 255),
            0x1a / 255 + galT * (0x08 / 255)
        );
        gsap.to(scene.background, { r: bg.r, g: bg.g, b: bg.b, duration: 1.8 });
    }

    // Scale sky objects with starfield; fade them out at planetary/stellar scale
    const skyFadeT = Math.min(1, Math.max(0, (r - 3e7) / 3.7e8));
    for (const name of ['sky-sun', 'sky-moon']) {
        const obj = scene.getObjectByName(name);
        if (!obj || !obj.userData.baseDir) continue;
        obj.position.copy(obj.userData.baseDir.clone().multiplyScalar(2e9 * starScale));
        obj.scale.setScalar(starScale);
        obj.children.forEach(child => {
            if (child.material) {
                const base = child.userData.baseOpacity ?? 1.0;
                gsap.to(child.material, { opacity: base * (1 - skyFadeT), duration: 1.2 });
            }
        });
    }
}

// Small sun and moon in the distant sky — always visible, fade at planetary scale.
function buildSkyObjects() {
    const R = 2e9;
    const diskSize = R * 0.005;  // ~0.5° angular diameter, matching real Sun/Moon

    // ── Sky Sun ──────────────────────────────────────────────
    const sunGroup = new THREE.Group();
    const sunDir   = new THREE.Vector3(0.65, 0.45, 0.48).normalize();
    sunGroup.position.copy(sunDir.clone().multiplyScalar(R));
    sunGroup.userData.baseDir = sunDir;

    const sunCore = new THREE.Mesh(
        new THREE.SphereGeometry(diskSize, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xfffde8, transparent: true, opacity: 1.0,
            depthWrite: false, depthTest: false })
    );
    sunCore.userData.baseOpacity = 1.0;
    sunGroup.add(sunCore);

    const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(diskSize * 2.2, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.18,
            depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    sunGlow.userData.baseOpacity = 0.18;
    sunGroup.add(sunGlow);

    sunGroup.name = 'sky-sun';
    sunGroup.renderOrder = -1;
    scene.add(sunGroup);

    // ── Sky Moon ─────────────────────────────────────────────
    const moonGroup = new THREE.Group();
    const moonDir   = new THREE.Vector3(-0.55, 0.38, 0.72).normalize();
    moonGroup.position.copy(moonDir.clone().multiplyScalar(R));
    moonGroup.userData.baseDir = moonDir;

    const moonDisk = new THREE.Mesh(
        new THREE.SphereGeometry(diskSize * 0.9, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xd8d8c8, transparent: true, opacity: 0.88,
            depthWrite: false, depthTest: false })
    );
    moonDisk.userData.baseOpacity = 0.88;
    moonGroup.add(moonDisk);

    moonGroup.name = 'sky-moon';
    moonGroup.renderOrder = -1;
    scene.add(moonGroup);
}

// ── Shooting stars ────────────────────────────────────────────
function spawnShootingStar() {
    const R = currentStarSphereR * 0.93;

    // Random point biased toward upper hemisphere
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(0.1 + Math.random() * 0.85);
    const px    = R * Math.sin(phi) * Math.cos(theta);
    const py    = R * Math.cos(phi);
    const pz    = R * Math.sin(phi) * Math.sin(theta);

    // Movement: tangent to sphere, slight downward drift
    const trailFrac = 0.055;
    const spd       = R * 0.20;
    const tx        = -Math.sin(theta) + (Math.random() - 0.5) * 0.3;
    const ty        = -0.22 + (Math.random() - 0.5) * 0.10;
    const tz        =  Math.cos(theta) + (Math.random() - 0.5) * 0.3;
    const len       = Math.sqrt(tx*tx + ty*ty + tz*tz);

    const dx = (tx / len) * spd, dy = (ty / len) * spd, dz = (tz / len) * spd;

    // Trail: head and tail points (tail lags by trailFrac of travel)
    const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(px, py, pz),
        new THREE.Vector3(px + dx * trailFrac, py + dy * trailFrac, pz + dz * trailFrac),
    ]);
    const mat = new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: false,
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = -1;

    const g = new THREE.Group();
    g.add(line);
    scene.add(g);

    const dur = 0.55 + Math.random() * 0.65;
    gsap.timeline()
        .to(mat, { opacity: 0.88, duration: 0.08 })
        .to(g.position, { x: dx, y: dy, z: dz, duration: dur, ease: 'power1.in' }, 0)
        .to(mat, { opacity: 0, duration: dur * 0.55, delay: dur * 0.38 }, 0)
        .call(() => { scene.remove(g); geo.dispose(); mat.dispose(); });
}

function startShootingStars() {
    (function schedule() {
        setTimeout(() => {
            if (scene) spawnShootingStar();
            // Occasionally fire a quick second star right after
            if (Math.random() < 0.18) setTimeout(spawnShootingStar, 280 + Math.random() * 400);
            schedule();
        }, 1800 + Math.random() * 3800);
    })();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCENE INIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function initScene() {
    const canvas = document.getElementById('three-canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060d1a);

    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.001, 3e9);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);

    // White-balanced lighting so the green sphere is always clearly visible
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(6, 12, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x4488ff, 0.7);
    rim.position.set(-8, 4, -6);
    scene.add(rim);

    // Ground plane — polygonOffset pushes it behind the grid to prevent z-fighting
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(1e7, 1e7),
        new THREE.MeshStandardMaterial({
            color: 0x0a1428, roughness: 0.85, metalness: 0.12,
            polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
            side: THREE.DoubleSide,
        })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Grid — zoomToFit recreates this at the right scale each time
    const grid = new THREE.GridHelper(10000, 100, 0x112244, 0x0a1830);
    grid.name = 'grid';
    grid.position.y = 0.01;
    scene.add(grid);

    // Starfield — fixed-pixel dots on a sphere scaled outward at large scenes
    const starVerts = [];
    const STAR_R = 2e9;
    for (let i = 0; i < 3000; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        starVerts.push(
            STAR_R * Math.sin(phi) * Math.cos(theta),
            STAR_R * Math.cos(phi),
            STAR_R * Math.sin(phi) * Math.sin(theta)
        );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    const stars = new THREE.Points(starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false,
            depthWrite: false, depthTest: false, transparent: true, opacity: 0.88 }));
    stars.name = 'stars';
    stars.renderOrder = -2;
    scene.add(stars);

    // Galactic band — Milky Way silhouette, fades in at cosmic scale
    scene.add(buildGalaxyBand());

    // Sky sun and moon — always visible background objects
    buildSkyObjects();

    startLoop();
    startShootingStars();
    window.addEventListener('resize', onResize);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RENDER LOOP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const T0 = performance.now();

function startLoop() {
    (function loop() {
        requestAnimationFrame(loop);
        const t = (performance.now() - T0) * 0.001;

        const angle = t * 0.14;
        camera.position.set(
            cam.cx + cam.dist * Math.sin(angle),
            cam.cy,
            cam.dist * Math.cos(angle)
        );
        camera.lookAt(cam.cx, cam.lookY, 0);

        if (sphereGroup) {
            const wire = sphereGroup.getObjectByName('wire');
            if (wire) wire.rotation.y = t * 0.09;
            const core = sphereGroup.getObjectByName('core');
            if (core?.material) core.material.opacity = 0.58 + Math.sin(t * 0.85) * 0.07;
        }

        updateLabels();
        renderer.render(scene, camera);
    })();
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CARBON SPHERE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function disposeGroup(g) {
    g.traverse(o => {
        o.geometry?.dispose();
        [].concat(o.material ?? []).forEach(m => m?.dispose());
    });
}

function buildSphere(radius) {
    if (sphereGroup) { scene.remove(sphereGroup); disposeGroup(sphereGroup); }

    const g = new THREE.Group();
    // Place immediately at final resting position — centre at y = radius (sitting on ground).
    g.position.set(0, radius, 0);

    // Core — dark gray smog bubble, semi-transparent
    const core = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 48, 48),
        new THREE.MeshStandardMaterial({
            color:             0x1e2028,
            emissive:          0x000000,
            emissiveIntensity: 0,
            roughness:         0.85,
            metalness:         0.05,
            transparent:       true,
            opacity:           0.72,
            side:              THREE.DoubleSide,
        })
    );
    core.name = 'core';
    g.add(core);

    // Wireframe accent — cool gray definition lines
    const wire = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.005, 18, 18),
        new THREE.MeshBasicMaterial({ color: 0x8899aa, wireframe: true, transparent: true, opacity: 0.25 })
    );
    wire.name = 'wire';
    g.add(wire);

    g.userData.baseRadius = radius;  // geometry radius before any scaling
    scene.add(g);
    sphereGroup = g;
    return g;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3-D COMPARISON OBJECT BUILDERS
// Each function receives (h) = total height in metres.
// Returns a THREE.Group with its base at y = 0.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...opts });
}

// ── AA battery ───────────────────────────────────────────────
function buildBattery(h) {
    const g = new THREE.Group(), r = h * 0.22;
    g.add(mesh(new THREE.CylinderGeometry(r, r, h * 0.85, 20), mat(0xddcc00, { metalness: 0.3 }), 0, h*0.44));
    g.add(mesh(new THREE.CylinderGeometry(r*0.45, r*0.45, h*0.07, 16), mat(0x888888, { metalness: 0.8 }), 0, h*0.9));
    g.add(mesh(new THREE.CylinderGeometry(r*1.02, r*1.02, h*0.025, 20), mat(0x666666, { metalness: 0.8 }), 0, h*0.012));
    return g;
}

// ── Coffee mug ───────────────────────────────────────────────
function buildMug(h) {
    const g = new THREE.Group(), r = h * 0.38;
    g.add(mesh(new THREE.CylinderGeometry(r, r * 0.88, h * 0.82, 24), mat(0xff4422, { roughness: 0.7 }), 0, h*0.42));
    // handle
    const handle = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, r * 0.12, 8, 22, Math.PI), mat(0xff4422, { roughness: 0.7 }));
    handle.rotation.y = Math.PI / 2;
    handle.rotation.z = Math.PI / 2;
    handle.position.set(r * 0.95, h * 0.42, 0);
    g.add(handle);
    return g;
}

// ── Cell phone ───────────────────────────────────────────────
function buildPhone(h) {
    const g = new THREE.Group();
    const w = h * 0.47, d = h * 0.07, mid = h * 0.48;
    // body — dark metal frame
    g.add(mesh(new THREE.BoxGeometry(w, h * 0.96, d),
        mat(0x1c1c1e, { metalness: 0.72, roughness: 0.2 }), 0, mid));
    // glowing screen (front face)
    g.add(mesh(new THREE.BoxGeometry(w * 0.84, h * 0.78, d * 0.01),
        mat(0x040d1a, { emissive: 0x0044bb, emissiveIntensity: 0.55, roughness: 0.05 }),
        0, mid + h * 0.02, d * 0.505));
    // home bar indicator
    g.add(mesh(new THREE.BoxGeometry(w * 0.24, h * 0.008, d * 0.02),
        mat(0x6666aa, { roughness: 0.5 }), 0, h * 0.10, d * 0.505));
    // camera island bump (back)
    g.add(mesh(new THREE.BoxGeometry(w * 0.38, h * 0.24, d * 0.14),
        mat(0x252527, { metalness: 0.85, roughness: 0.12 }),
        -w * 0.08, h * 0.77, -d * 0.555));
    // two camera lenses (cylinders aligned to Z axis)
    for (const ly of [h * 0.80, h * 0.73]) {
        const lens = mesh(new THREE.CylinderGeometry(w * 0.07, w * 0.07, d * 0.10, 14),
            mat(0x030a12, { emissive: 0x002244, emissiveIntensity: 0.3, metalness: 0.9 }),
            -w * 0.08, ly, -d * 0.56);
        lens.rotation.x = Math.PI / 2;
        g.add(lens);
    }
    return g;
}

// ── Adult human ──────────────────────────────────────────────
function buildHuman(h) {
    const g = new THREE.Group();
    const skin = mat(0xF4A460, { roughness: 0.8 });
    const cloth = mat(0x334466, { roughness: 0.9 });
    // head
    g.add(mesh(new THREE.SphereGeometry(h*0.08, 16, 16), skin, 0, h*0.93));
    // torso
    g.add(mesh(new THREE.CylinderGeometry(h*0.1, h*0.11, h*0.32, 12), cloth, 0, h*0.65));
    // legs
    for (const s of [-1,1]) {
        g.add(mesh(new THREE.CylinderGeometry(h*0.055, h*0.048, h*0.4, 10), cloth, s*h*0.065, h*0.22));
        // shoes
        g.add(mesh(new THREE.BoxGeometry(h*0.08, h*0.04, h*0.14), mat(0x222222), s*h*0.065, h*0.02, h*0.03));
    }
    // arms
    for (const s of [-1,1]) {
        const arm = mesh(new THREE.CylinderGeometry(h*0.042, h*0.035, h*0.30, 10), skin, s*h*0.18, h*0.61);
        arm.rotation.z = s * 0.25;
        g.add(arm);
    }
    return g;
}

// ── Family car ───────────────────────────────────────────────
function buildCar(h) {
    const g = new THREE.Group(), bw = h * 2.5, bd = h * 1.2;
    const bodyMat = mat(0xff2200, { metalness: 0.6, roughness: 0.3 });
    const glassMat = mat(0x88ccee, { metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.5 });
    const wheelMat = mat(0x111111, { roughness: 0.95, metalness: 0.05 });
    const rimMat   = mat(0xaaaaaa, { metalness: 0.8, roughness: 0.2 });

    // body
    g.add(mesh(new THREE.BoxGeometry(bw, h*0.48, bd), bodyMat, 0, h*0.54));
    // cabin
    g.add(mesh(new THREE.BoxGeometry(bw*0.65, h*0.36, bd*0.88), bodyMat, 0, h*0.86));
    // windows (front/rear)
    for (const z of [bd*0.44, -bd*0.44]) {
        g.add(mesh(new THREE.BoxGeometry(bw*0.62, h*0.22, h*0.01), glassMat, 0, h*0.84, z));
    }
    // 4 wheels
    for (const [x, z] of [[bw*0.42,bd*0.46],[bw*0.42,-bd*0.46],[-bw*0.42,bd*0.46],[-bw*0.42,-bd*0.46]]) {
        const wh = mesh(new THREE.CylinderGeometry(h*0.26, h*0.26, h*0.18, 18), wheelMat, x, h*0.26, z);
        wh.rotation.z = Math.PI/2;
        g.add(wh);
        const rim = mesh(new THREE.CylinderGeometry(h*0.13, h*0.13, h*0.19, 8), rimMat, x, h*0.26, z);
        rim.rotation.z = Math.PI/2;
        g.add(rim);
    }
    return g;
}

// ── Mature tree ──────────────────────────────────────────────
function buildTree(h) {
    const g = new THREE.Group();
    const trunkH = h * 0.38, trunkR = h * 0.038;
    g.add(mesh(new THREE.CylinderGeometry(trunkR * 0.72, trunkR * 1.15, trunkH, 10),
        mat(0x6b4220, { roughness: 0.92 }), 0, trunkH * 0.5));
    // Round canopy — main sphere
    const cr = h * 0.30;
    const cy = trunkH + cr * 0.86;
    g.add(mesh(new THREE.SphereGeometry(cr, 14, 12), mat(0x2d7322, { roughness: 0.88 }), 0, cy));
    // Secondary lumps for organic fullness
    const lumps = [
        [ h*0.16, cy - cr*0.10,  h*0.05, cr*0.62, 0x348228],
        [-h*0.15, cy - cr*0.15, -h*0.04, cr*0.58, 0x265e1a],
        [ h*0.03, cy + cr*0.44, -h*0.08, cr*0.48, 0x3a6e26],
    ];
    for (const [x, y, z, r2, col] of lumps)
        g.add(mesh(new THREE.SphereGeometry(r2, 11, 9), mat(col, { roughness: 0.85 }), x, y, z));
    return g;
}

// ── House ────────────────────────────────────────────────────
function buildHouse(h) {
    const g = new THREE.Group(), w = h * 0.85;
    g.add(mesh(new THREE.BoxGeometry(w, h*0.62, w), mat(0xf5deb3, { roughness: 0.85 }), 0, h*0.31));
    // roof (4-sided pyramid)
    const roof = mesh(new THREE.ConeGeometry(w*0.78, h*0.38, 4), mat(0x8B4513, { roughness: 0.8 }), 0, h*0.81);
    roof.rotation.y = Math.PI/4;
    g.add(roof);
    // door
    g.add(mesh(new THREE.BoxGeometry(w*0.14, h*0.26, w*0.01), mat(0x5c3317, { roughness: 0.9 }), 0, h*0.15, w*0.5));
    // windows
    for (const x of [-w*0.26, w*0.26]) {
        g.add(mesh(new THREE.BoxGeometry(w*0.16, w*0.14, w*0.01), mat(0x88ccee, { transparent: true, opacity: 0.6, roughness: 0.05 }), x, h*0.42, w*0.5));
    }
    return g;
}

// ── Big Ben ──────────────────────────────────────────────────
function buildBigBen(h) {
    const g = new THREE.Group(), w = h * 0.16;
    const stone = mat(0xcfba98, { roughness: 0.85 });
    g.add(mesh(new THREE.BoxGeometry(w, h*0.68, w), stone, 0, h*0.34));
    // clock tier (slightly wider)
    g.add(mesh(new THREE.BoxGeometry(w*1.2, h*0.11, w*1.2), stone, 0, h*0.73));
    // clock faces (4 sides)
    for (const [rx, rz, xo, zo] of [[0,0,0,w*0.61],[0,Math.PI,0,-w*0.61],[0,Math.PI/2,w*0.61,0],[0,-Math.PI/2,-w*0.61,0]]) {
        const face = mesh(new THREE.PlaneGeometry(w*0.7, h*0.09), mat(0xfff8cc, { roughness: 0.5 }), xo, h*0.73, zo);
        face.rotation.y = rz;
        g.add(face);
    }
    // spire
    g.add(mesh(new THREE.ConeGeometry(w*0.28, h*0.18, 8), mat(0x888877, { metalness: 0.4 }), 0, h*0.90));
    return g;
}

// ── Eiffel Tower ─────────────────────────────────────────────
function buildEiffelTower(h) {
    const g = new THREE.Group(), w = h * 0.13;
    const iron = mat(0x8B7355, { metalness: 0.45, roughness: 0.55 });

    // 4 angled lower legs
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI/2 + Math.PI/4;
        const leg = mesh(new THREE.CylinderGeometry(w*0.03, w*0.09, h*0.3, 6), iron, w*0.58*Math.cos(a), h*0.17, w*0.58*Math.sin(a));
        leg.rotation.x = -Math.sin(a) * 0.38;
        leg.rotation.z = -Math.cos(a) * 0.38;
        g.add(leg);
    }
    // 1st floor ring
    g.add(mesh(new THREE.CylinderGeometry(w*0.52, w*0.52, h*0.018, 8), iron, 0, h*0.285));
    // 4 upper legs
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI/2 + Math.PI/4;
        const leg = mesh(new THREE.CylinderGeometry(w*0.018, w*0.038, h*0.24, 6), iron, w*0.24*Math.cos(a), h*0.46, w*0.24*Math.sin(a));
        leg.rotation.x = -Math.sin(a) * 0.17;
        leg.rotation.z = -Math.cos(a) * 0.17;
        g.add(leg);
    }
    // 2nd floor ring
    g.add(mesh(new THREE.CylinderGeometry(w*0.22, w*0.22, h*0.014, 8), iron, 0, h*0.565));
    // upper tapered shaft
    g.add(mesh(new THREE.CylinderGeometry(w*0.018, w*0.16, h*0.31, 8), iron, 0, h*0.725));
    // antenna
    g.add(mesh(new THREE.CylinderGeometry(w*0.007, w*0.013, h*0.085, 6), mat(0xaaaaaa, { metalness: 0.9 }), 0, h*0.926));
    return g;
}

// ── Burj Khalifa ─────────────────────────────────────────────
function buildBurjKhalifa(h) {
    const g = new THREE.Group(), w = h * 0.065;
    const glass = mat(0x7ab0cc, { metalness: 0.7, roughness: 0.1, transparent: true, opacity: 0.88 });

    // 3 wing towers arranged in Y-shape (its distinctive cross-section)
    for (let i = 0; i < 3; i++) {
        const a = (i * 2*Math.PI/3) + Math.PI/6;
        const ht = h * (0.82 - i * 0.04);
        g.add(mesh(new THREE.BoxGeometry(w*0.55, ht, w*0.55), glass, w*0.28*Math.cos(a), ht/2, w*0.28*Math.sin(a)));
    }
    // Central core (tapered cylinder)
    g.add(mesh(new THREE.CylinderGeometry(w*0.1, w*0.2, h*0.88, 8), glass, 0, h*0.44));
    // Spire
    g.add(mesh(new THREE.CylinderGeometry(0.001, w*0.07, h*0.1, 6), mat(0xbbbbbb, { metalness: 0.85 }), 0, h*0.935));
    return g;
}

// ── Mt. Everest ───────────────────────────────────────────────
function buildMountain(h) {
    const g = new THREE.Group();
    const rock = mat(0x7a6555, { roughness: 1.0 });
    // main bulk
    g.add(mesh(new THREE.ConeGeometry(h*0.62, h*0.80, 6), rock, 0, h*0.40));
    // mid ridge
    g.add(mesh(new THREE.ConeGeometry(h*0.30, h*0.44, 5), mat(0x6a5548, { roughness: 1.0 }), h*0.12, h*0.58));
    // snow cap
    g.add(mesh(new THREE.ConeGeometry(h*0.10, h*0.20, 6), mat(0xeeeeff, { roughness: 0.6 }), 0, h*0.91));
    return g;
}

// ── Low Earth Orbit satellite ────────────────────────────────
function buildSatellite(h) {
    const g = new THREE.Group();
    const r = h * 0.0014;  // altitude column radius

    // altitude marker beam (ground → orbit)
    g.add(mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 6),
        new THREE.MeshBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.38 }),
        0, h * 0.5));

    // flat orbital ring at altitude h
    const orbitRing = new THREE.Mesh(
        new THREE.TorusGeometry(h * 0.24, r * 1.6, 6, 64),
        new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.7 })
    );
    orbitRing.rotation.x = Math.PI / 2;
    orbitRing.position.y = h;
    g.add(orbitRing);

    // satellite body at orbit
    const s = h * 0.017;
    const sat = new THREE.Group();
    sat.position.set(h * 0.24, h, 0);
    sat.add(mesh(new THREE.BoxGeometry(s * 1.2, s * 0.8, s * 1.8),
        mat(0x8899bb, { metalness: 0.75, roughness: 0.3 })));
    // solar panels
    for (const sx of [s * 2.9, -s * 2.9]) {
        sat.add(mesh(new THREE.BoxGeometry(s * 2.4, s * 0.06, s * 1.2),
            mat(0x1a3355, { emissive: 0x0a1a33, emissiveIntensity: 0.6 }), sx, 0, 0));
    }
    g.add(sat);
    return g;
}

// ── Geostationary orbit comms satellite ──────────────────────
function buildGeoSat(h) {
    const g = new THREE.Group();
    const r = h * 0.0012;

    // altitude beam (warm gold tint for GEO distinction)
    g.add(mesh(new THREE.CylinderGeometry(r * 0.5, r, h, 6),
        new THREE.MeshBasicMaterial({ color: 0x443322, transparent: true, opacity: 0.32 }),
        0, h * 0.5));

    // flat orbital ring (gold)
    const orbitRing = new THREE.Mesh(
        new THREE.TorusGeometry(h * 0.20, r * 1.5, 6, 64),
        new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.62 })
    );
    orbitRing.rotation.x = Math.PI / 2;
    orbitRing.position.y = h;
    g.add(orbitRing);

    // comms satellite body
    const s = h * 0.016;
    const sat = new THREE.Group();
    sat.position.set(h * 0.20, h, 0);
    sat.add(mesh(new THREE.BoxGeometry(s, s * 1.2, s * 1.5),
        mat(0xaa9966, { metalness: 0.6, roughness: 0.3 })));
    // large gold solar panels
    for (const sx of [s * 3.4, -s * 3.4]) {
        sat.add(mesh(new THREE.BoxGeometry(s * 2.8, s * 0.04, s * 1.3),
            mat(0x664400, { emissive: 0x553300, emissiveIntensity: 0.8 }), sx, 0, 0));
    }
    // dish antenna (open hemisphere facing forward)
    const dish = new THREE.Mesh(
        new THREE.SphereGeometry(s * 1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.44),
        mat(0xccccaa, { side: THREE.BackSide, roughness: 0.45 })
    );
    dish.rotation.x = Math.PI * 0.82;
    dish.position.set(0, s * 0.5, s * 1.1);
    sat.add(dish);
    g.add(sat);
    return g;
}

// ── Earth ─────────────────────────────────────────────────────
function buildEarth(h) {
    const r = h / 2, g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(r, 36, 36), mat(0x1a6699, { roughness: 0.7 })));
    // landmass patches (simplified using MeshBasicMaterial quads on surface)
    const land = mat(0x2d7a2d, { roughness: 0.9 });
    for (const [rx,ry,rz,sr] of [[0.3,0.5,0,r*0.55],[-0.4,2.2,0,r*0.45],[0.2,3.8,0.3,r*0.4],[-0.5,1.1,0,r*0.35]]) {
        const patch = new THREE.Mesh(new THREE.SphereGeometry(sr, 12, 12, 0, Math.PI*2, 0, Math.PI*0.55), land);
        patch.rotation.set(rx, ry, rz);
        g.add(patch);
    }
    // polar ice caps
    const ice = mat(0xeeeeff, { roughness: 0.5 });
    for (const ySign of [1,-1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(r*0.32, 14, 14, 0, Math.PI*2, 0, Math.PI*0.26), ice);
        cap.position.y = ySign * r * 0.78;
        cap.rotation.x = ySign > 0 ? 0 : Math.PI;
        g.add(cap);
    }
    g.position.y = r; // sit on ground
    return g;
}

// ── Moon ─────────────────────────────────────────────────────
function buildMoon(h) {
    const r = h / 2, g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(r, 32, 32), mat(0x999988, { roughness: 0.9, metalness: 0 })));
    // A few craters (dark concave discs)
    const crater = mat(0x777766, { roughness: 1.0 });
    for (const [rx,ry,s] of [[0.8,1.2,0.09],[-0.5,2.5,0.07],[1.2,0.3,0.05]]) {
        const c = new THREE.Mesh(new THREE.CircleGeometry(r*s, 14), crater);
        c.position.set(r*Math.sin(ry)*Math.cos(rx), r*Math.sin(rx), r*Math.cos(ry)*Math.cos(rx));
        c.lookAt(0, 0, 0);
        g.add(c);
    }
    g.position.y = r;
    return g;
}

// ── Saturn ───────────────────────────────────────────────────
function buildSaturn(h) {
    const r = h / 2, g = new THREE.Group();
    // Planet body — warm golden-tan
    g.add(mesh(new THREE.SphereGeometry(r, 32, 24), mat(0xd4a96a, { roughness: 0.72 }), 0, r));
    // Rings — iconic tilted disc (TorusGeometry flattened)
    const innerR = r * 1.22, ringW = r * 0.72;
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(innerR + ringW / 2, ringW / 2, 3, 80),
        mat(0xc8a55e, { roughness: 0.85, transparent: true, opacity: 0.78 })
    );
    ring.rotation.x = Math.PI * 0.42;   // ~75° tilt — classic Saturn view
    ring.position.y = r;
    g.add(ring);
    // Subtle equatorial band
    g.add(mesh(new THREE.TorusGeometry(r, r * 0.06, 6, 40),
        mat(0xbe9455, { roughness: 0.8 }), 0, r));
    g.position.y = 0;
    return g;
}

// ── Jupiter ──────────────────────────────────────────────────
function buildJupiter(h) {
    const r = h / 2, g = new THREE.Group();
    // Base sphere — creamy orange-tan
    g.add(mesh(new THREE.SphereGeometry(r, 32, 24), mat(0xc89a60, { roughness: 0.68 }), 0, r));
    // Cloud bands — symmetric tori above and below equator
    const bands = [
        [r * 0.82, r * 0.065, 0xb87840],
        [r * 0.52, r * 0.055, 0xd4aa70],
        [r * 0.20, r * 0.060, 0xa86830],
    ];
    for (const [lat, thick, col] of bands) {
        const bandR = Math.sqrt(Math.max(0, r*r - lat*lat));
        for (const sign of [1, -1]) {
            const band = new THREE.Mesh(
                new THREE.TorusGeometry(bandR, thick, 4, 48),
                mat(col, { roughness: 0.75 })
            );
            band.rotation.x = Math.PI / 2;
            band.position.set(0, r + sign * lat, 0);
            g.add(band);
        }
    }
    // Great Red Spot — oval patch
    const grs = mesh(new THREE.SphereGeometry(r * 0.16, 14, 10),
        mat(0xcc4422, { roughness: 0.7 }), r * 0.72, r * 0.82, r * 0.28);
    g.add(grs);
    return g;
}

// ── Sun ──────────────────────────────────────────────────────
function buildSun(h) {
    const r = h / 2, g = new THREE.Group();
    // Core — bright yellow-orange
    g.add(mesh(new THREE.SphereGeometry(r, 32, 24),
        mat(0xffaa00, { emissive: 0xff6600, emissiveIntensity: 0.75, roughness: 0.9 }), 0, r));
    // Outer corona glow (two nested transparent shells)
    for (const [sr, op] of [[1.06, 0.14], [1.13, 0.07]]) {
        g.add(mesh(new THREE.SphereGeometry(r * sr, 20, 16),
            new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: op, side: THREE.FrontSide, depthWrite: false }),
            0, r));
    }
    return g;
}

// Utility: create mesh with optional position
function mesh(geo, mat, x=0, y=0, z=0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
}

// ── Dispatch ─────────────────────────────────────────────────
function buildTierMesh(tier) {
    const h = tier.height_m;
    switch (tier.name) {
        case 'AA battery':            return buildBattery(h);
        case 'Coffee mug':            return buildMug(h);
        case 'Cell phone':            return buildPhone(h);
        case 'Adult human':           return buildHuman(h);
        case 'Tree':                  return buildTree(h);
        case 'House':                 return buildHouse(h);
        case 'Big Ben':               return buildBigBen(h);
        case 'Eiffel Tower':          return buildEiffelTower(h);
        case 'Burj Khalifa':          return buildBurjKhalifa(h);
        case 'Mt. Everest':           return buildMountain(h);
        case 'Low Earth Orbit':       return buildSatellite(h);
        case 'Moon':                  return buildMoon(h);
        case "Earth's diameter":      return buildEarth(h);
        case 'Saturn':                return buildSaturn(h);
        case 'Jupiter':               return buildJupiter(h);
        case 'Sun':                   return buildSun(h);
        default:                      return buildGenericPillar(h);
    }
}

function buildGenericPillar(h) {
    const g = new THREE.Group(), w = h * 0.08;
    g.add(mesh(new THREE.CylinderGeometry(w*0.7, w, h, 12), mat(0x4488ff, { metalness: 0.5 }), 0, h/2));
    g.add(mesh(new THREE.SphereGeometry(w*2, 14, 14), mat(0x88aaff, { metalness: 0.7 }), 0, h + w*2));
    return g;
}

// ── Place comparison in scene ─────────────────────────────────
function buildComparison(tier, sphereRadius) {
    if (compGroup) { scene.remove(compGroup); disposeGroup(compGroup); }

    const g = new THREE.Group();
    g.userData.floatAmp = tier.height_m * 0.005;
    g.userData.tierName = tier.name;

    g.add(buildTierMesh(tier));

    // layoutScene() will position this correctly
    g.position.set(0, 0, 0);

    scene.add(g);
    compGroup = g;
    return g;
}

// ── Always-present 1.7 m reference human ─────────────────────
function updateScalePerson(tierName) {
    if (personGroup) { scene.remove(personGroup); disposeGroup(personGroup); personGroup = null; }
    if (tierName === 'Adult human') return;  // comp IS the human — don't duplicate
    const g = buildHuman(1.7);
    g.position.set(0, 0, 0);  // layoutScene() will position this
    scene.add(g);
    personGroup = g;
}

// Returns the X half-width (from center to edge) of a tier's 3D model.
// These are derived from the actual builder geometry so spacing never overlaps.
function tierHalfW(tier) {
    const h = tier.height_m;
    switch (tier.name) {
        case 'AA battery':            return h * 0.22;
        case 'Coffee mug':            return h * 0.40;
        case 'Cell phone':            return h * 0.25;
        case 'Adult human':           return h * 0.22;
        case 'Tree':                  return h * 0.38;   // main sphere r=h*0.30, side lump to h*0.346
        case 'House':                 return h * 0.48;   // w = h*0.85, halfW ≈ h*0.43 + padding
        case 'Big Ben':               return h * 0.12;
        case 'Eiffel Tower':          return h * 0.14;
        case 'Burj Khalifa':          return h * 0.10;
        case 'Mt. Everest':           return h * 0.65;
        case 'Low Earth Orbit':       return h * 0.27;
        case 'Moon':                  return h * 0.50;
        case "Earth's diameter":      return h * 0.50;
        case 'Saturn':                return h * 1.05;  // rings extend to ~r*(1.22+0.72)=1.94r each side → h*0.97, add padding
        case 'Jupiter':               return h * 0.50;
        case 'Sun':                   return h * 0.50;
        default:                      return h * 0.35;
    }
}

// ── Sort and position all scene objects left-to-right by ascending height ──
// Returns the scene center X so zoomToFit can frame correctly.
function layoutScene(r, tier, animate = true) {
    const items = [];
    if (personGroup)  items.push({ group: personGroup,  height: 1.7,           halfW: 1.7 * 0.22 });
    if (compGroup)    items.push({ group: compGroup,    height: tier.height_m, halfW: tierHalfW(tier) });
    if (sphereGroup)  items.push({ group: sphereGroup,  height: r * 2,         halfW: r });

    items.sort((a, b) => a.height - b.height);

    const gap      = Math.max(r * 0.4, tier.height_m * 0.3, 1.0);
    const totalW   = items.reduce((s, it) => s + it.halfW * 2, 0) + gap * (items.length - 1);
    let   x        = -totalW / 2;
    let   sumX     = 0;

    for (const item of items) {
        x += item.halfW;
        const tx = x;
        sumX += tx;

        if (item.group === sphereGroup) {
            if (animate) gsap.to(item.group.position, { x: tx, y: r, duration: 0.4, ease: 'power2.out' });
            else         item.group.position.set(tx, r, 0);
        } else {
            if (animate) gsap.to(item.group.position, { x: tx, duration: 0.4, ease: 'power2.out' });
            else         item.group.position.x = tx;
        }

        x += item.halfW + gap;
    }

    return items.length > 0 ? sumX / items.length : 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTML LABELS (projected each frame)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function project(wx, wy, wz) {
    const v = new THREE.Vector3(wx, wy, wz).project(camera);
    return { x: (v.x+1)/2*innerWidth, y: (-v.y+1)/2*innerHeight, ok: v.z > -1 && v.z < 1 };
}

function updateLabels() {
    const ov = document.getElementById('labels-overlay');
    ov.innerHTML = '';
    if (!sphereGroup || !currentData) return;

    const mult   = combinedMultiplier();
    const co2    = currentData.co2_kg * mult;
    const r      = co2ToRadius(co2);
    const sS     = sphereGroup.scale.x;
    const baseR  = sphereGroup.userData.baseRadius ?? r;  // geometry radius before scaling
    const tier   = getComparisonTier(co2);

    // Project from the actual current sphere top (baseR * sS = current world-space radius).
    // Walk down in fractions until we find a point the camera can project onto screen.
    let sp = null;
    for (const frac of [1.0, 0.80, 0.55, 0.30, 0.0]) {
        const p = project(
            sphereGroup.position.x,
            sphereGroup.position.y + baseR * sS * frac,
            sphereGroup.position.z
        );
        if (p.ok && p.y >= 0 && p.y < innerHeight) { sp = p; break; }
    }
    if (sp) addLabel(ov, sp, 'CO₂ Bubble', `⌀ ${fmtDist(r * 2)}`, '');

    if (compGroup) {
        const cp = project(compGroup.position.x, compGroup.position.y + tier.height_m, compGroup.position.z);
        if (cp.ok) addLabel(ov, cp, tier.label, fmtDist(tier.height_m), 'blue');
    }

    if (personGroup) {
        const pp = project(personGroup.position.x, 1.78, 0);
        if (pp.ok) addLabel(ov, pp, 'Person', useImperial ? "5'7\"" : '1.7 m', 'blue');
    }
}

function addLabel(ov, pos, title, sub, cls) {
    const el = document.createElement('div');
    el.className = `label-3d ${cls}`;
    el.innerHTML = `${title}<small>${sub}</small>`;
    const clampedY = Math.max(12, pos.y - 10);
    el.style.cssText = `left:${pos.x}px;top:${clampedY}px`;
    ov.appendChild(el);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CAMERA — ZOOM TO FIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function zoomToFit(sceneCenterX) {
    if (!currentData) return;
    const mult    = combinedMultiplier();
    const co2     = currentData.co2_kg * mult;
    const r       = co2ToRadius(co2);
    const tier    = getComparisonTier(co2);
    const maxDim  = Math.max(r * 2, tier.height_m);
    const cx      = sceneCenterX ?? 0;

    // near/far: reach the scaled starfield (always at max(2e9, r*6) from origin)
    const scaledStarR = Math.max(2e9, r * 6);
    camera.near = maxDim * 0.0001;
    camera.far  = Math.max(scaledStarR * 3, maxDim * 50000, 3e9);
    camera.updateProjectionMatrix();

    // Rescale grid so lines stay proportional and y-offset prevents z-fighting
    const oldGrid = scene.getObjectByName('grid');
    if (oldGrid) { scene.remove(oldGrid); oldGrid.geometry.dispose(); }
    const newGrid = new THREE.GridHelper(maxDim * 18, 80, 0x112244, 0x0a1830);
    newGrid.name = 'grid';
    newGrid.position.y = maxDim * 0.0002;
    scene.add(newGrid);

    // Push starfield and fade galaxy band proportionally with scene scale
    updateCosmicBackground(r);

    // Set cam values directly — render loop will use them immediately.
    // GSAP tweens them smoothly from whatever the previous values were.
    gsap.to(cam, {
        cx:    cx,
        cy:    Math.max(maxDim * 0.7, 1.2),
        dist:  maxDim * 2.8,
        lookY: Math.max(maxDim * 0.3, 0.3),
        duration: 1.6,
        ease: 'power2.inOut',
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROQ API // Replaced with Gemini
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callGroq(activityText) {
    // Instead of calling Groq directly, we call our own /api/footprint endpoint
    const res = await fetch('/api/footprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityText }),
    });

    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'API Error');
    }

    const parsed = await res.json();

    // Keep your existing validation logic
    if (!Number.isFinite(parsed.co2_kg) || parsed.co2_kg <= 0) throw new Error('Invalid data');
    parsed.base_quantity ??= 1;
    parsed.activity_unit ??= 'unit';
    parsed.humanity_scale ??= '';
    parsed.suggested_frequency ??= 'once';
    
    return parsed;
}


async function callGroq(activityText) {
    // We send the text to our internal Vercel API instead of Groq's website
    const res = await fetch('/api/footprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityText }), 
    });

    if (!res.ok) {
        throw new Error(`Cloud Function Error: ${res.status}`);
    }

    const parsed = await res.json();

    // Keep your safety checks to make sure the 3D bubble has numbers to work with
    if (!Number.isFinite(parsed.co2_kg) || parsed.co2_kg <= 0) throw new Error('Invalid data');
    parsed.base_quantity        ??= 1;
    parsed.activity_unit        ??= 'unit';
    parsed.humanity_scale       ??= '';
    parsed.suggested_frequency  ??= 'once';

    return parsed;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function freqVal() {
    const active = document.querySelector('.freq-btn.active');
    return active ? parseInt(active.dataset.freq, 10) : 1;
}
function setFreq(n) {
    document.querySelectorAll('.freq-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.freq, 10) === n);
    });
}
function popSliderVal(){ return parseInt(document.getElementById('pop-slider').value, 10); }
function popMultiplier(pos) {
    if (pos <= 1) return 1;
    return Math.round(Math.pow(10, (pos - 1) * Math.log10(SLIDER_MAX_MULT) / 9));
}
function combinedMultiplier() { return freqVal() * popMultiplier(popSliderVal()); }

const LIFETIME_DAYS = 365 * 78;  // ~28,470 days (78-year lifespan)

function fmtFreqLabel(n) {
    if (n === 1)            return 'once';
    if (n === 7)            return 'each day for a week';
    if (n === 30)           return 'each day for a month';
    if (n === 365)          return 'each day for a year';
    if (n === LIFETIME_DAYS) return 'each day for a lifetime';
    return `${n}×`;
}
function fmtPop(mult) {
    if (mult <= 1)               return 'just you';
    if (mult >= SLIDER_MAX_MULT) return 'all 8.1B people';
    return `${fmtNum(mult)} people`;
}
function setLoading(on) {
    document.getElementById('loading-panel').classList.toggle('hidden', !on);
    document.getElementById('submit-btn').disabled = on;
}
function showError(msg) {
    setLoading(false);
    document.getElementById('error-panel').classList.remove('hidden');
    document.getElementById('error-message').textContent = `Error: ${msg}`;
}

function updateResultsPanel(co2, tier, freq, popMult) {
    const mult = freq * popMult;
    document.getElementById('co2-amount').textContent = fmtCO2(co2);
    document.getElementById('pop-context').textContent = populationContext(co2);

    const label = tier.label.charAt(0).toUpperCase() + tier.label.slice(1);
    document.getElementById('comparison-name').textContent = label;

    const ratio = co2ToRadius(co2) / tier.height_m;
    const scaleStr = ratio > 100 ? `Bubble is ${ratio.toFixed(0)}× taller`
                   : ratio > 2   ? `Bubble is ${ratio.toFixed(1)}× taller`
                   :               `Bubble is ${ratio.toFixed(2)}× taller`;
    document.getElementById('comparison-scale').textContent = scaleStr;

    const ql = document.getElementById('quantity-label');
    if (mult > 1 && currentData) {
        const parts = [];
        if (freq > 1)    parts.push(fmtFreqLabel(freq));
        if (popMult > 1) parts.push(`${fmtNum(popMult)} people`);
        ql.textContent = parts.join(' · ') + ` = ${fmtNum(currentData.base_quantity * mult)} ${currentData.activity_unit}`;
    } else {
        ql.textContent = '';
    }

    if (currentData) {
        const nearMax = popMult >= SLIDER_MAX_MULT * 0.5;
        const factEl  = document.getElementById('fun-fact');
        factEl.textContent = (nearMax && currentData.humanity_scale)
            ? currentData.humanity_scale : currentData.fun_fact;
    }

    updateImpactPanels(co2);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCENE REFRESH  (slider drag — no API call)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function refreshScene() {
    if (!currentData || !sphereGroup) return;
    const freq    = freqVal();
    const popMult = popMultiplier(popSliderVal());
    const mult    = freq * popMult;
    const co2     = currentData.co2_kg * mult;
    const r       = co2ToRadius(co2);
    const tier    = getComparisonTier(co2);
    const baseR   = co2ToRadius(currentData.co2_kg);
    const sf      = r / baseR;

    gsap.to(sphereGroup.scale, { x: sf, y: sf, z: sf, duration: 0.4, ease: 'power2.out' });

    if (compGroup?.userData.tierName !== tier.name) {
        buildComparison(tier, r);
    }

    // Show/hide reference person based on whether comparison tier is a human
    if (tier.name === 'Adult human') {
        if (personGroup) { scene.remove(personGroup); disposeGroup(personGroup); personGroup = null; }
    } else if (!personGroup) {
        const pg = buildHuman(1.7);
        pg.position.set(0, 0, 0);
        scene.add(pg);
        personGroup = pg;
    }

    const center = layoutScene(r, tier, true);
    zoomToFit(center);
    updateResultsPanel(co2, tier, freq, popMult);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUBMIT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleSubmit() {
    console.log('[ClimVis] submit');
    const input = document.getElementById('main-input').value.trim();
    if (!input) { document.getElementById('main-input').focus(); return; }

    document.getElementById('error-panel').classList.add('hidden');
    document.getElementById('results-panel').classList.add('hidden');
    document.getElementById('zoom-btn').classList.add('hidden');
    setFreq(1);
    document.getElementById('pop-slider').value = 1;
    document.getElementById('pop-slider-value').textContent = 'just you';
    document.getElementById('quantity-label').textContent = '';
    setLoading(true);

    try {
        const data = await callGroq(input);
        currentData = data;

        // Auto-select the frequency the LLM thinks fits this activity
        const freqMap = { once: 1, week: 7, month: 30, year: 365 };
        setFreq(freqMap[data.suggested_frequency] ?? 1);

        // Build sphere at BASE co2 (refreshScene will apply freq×pop scaling)
        const baseR    = co2ToRadius(data.co2_kg);
        const baseTier = getComparisonTier(data.co2_kg);
        const baseDim  = Math.max(baseR * 2, baseTier.height_m);

        buildSphere(baseR);
        buildComparison(baseTier, baseR);
        updateScalePerson(baseTier.name);
        const center = layoutScene(baseR, baseTier, false);  // place immediately, no animation

        // Snap camera to base size; refreshScene will re-frame to scaled size
        cam.dist  = baseDim * 2.8;
        cam.cy    = Math.max(baseDim * 0.7, 1.2);
        cam.lookY = Math.max(baseDim * 0.3, 0.3);
        cam.cx    = center;
        camera.near = baseDim * 0.0001;
        camera.far  = Math.max(baseDim * 50000, 3e9);
        camera.updateProjectionMatrix();

        setLoading(false);
        document.getElementById('results-panel').classList.remove('hidden');
        document.getElementById('zoom-btn').classList.remove('hidden');

        // refreshScene applies current freq×pop, updates camera, and fills the panel
        refreshScene();
        regenerateChips();  // background — refresh quick-start ideas

    } catch (err) {
        console.error(err);
        showError(err.message);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPACT PANELS  (thermometer + ocean rise overlay)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Climate sensitivity: ~8.2e-4 °C per Gt CO₂  (TCR, IPCC AR6)
const DEG_PER_KG  = 8.2e-16;
// Sea-level: ~3.7 mm/yr from ~37 Gt/yr  → 1.0e-13 m per kg
const MM_PER_KG   = 1.0e-13 * 1000; // convert to mm → 1e-10 mm/kg
// Remaining 1.5 °C carbon budget (Gt CO₂, IPCC 2023 estimate)
const BUDGET_KG   = 250e12;

function fmtTemp(degC) {
    if (useImperial) {
        const degF = degC * 1.8;
        if (degF < 1e-6)  return `${(degF * 1e9).toFixed(2)} nano°F`;
        if (degF < 1e-3)  return `${(degF * 1e6).toFixed(2)} micro°F`;
        if (degF < 1)     return `${(degF * 1000).toFixed(2)} milli°F`;
        return `+${degF.toFixed(3)} °F`;
    }
    if (degC < 1e-6)  return `${(degC * 1e9).toFixed(2)} nano°C`;
    if (degC < 1e-3)  return `${(degC * 1e6).toFixed(2)} micro°C`;
    if (degC < 1)     return `${(degC * 1000).toFixed(2)} milli°C`;
    return `+${degC.toFixed(3)} °C`;
}
function fmtMM(mm) {
    if (useImperial) {
        const ins = mm * 0.0393701;
        if (ins < 1e-6)  return `${(ins * 1e9).toFixed(2)} nano-in`;
        if (ins < 1e-3)  return `${(ins * 1e6).toFixed(2)} micro-in`;
        if (ins < 1)     return `${(ins * 1000).toFixed(2)} milli-in`;
        if (ins < 12)    return `${ins.toFixed(3)} in`;
        return `${(ins / 12).toFixed(3)} ft`;
    }
    if (mm < 0.001)   return `${(mm * 1e6).toFixed(2)} nano-mm`;
    if (mm < 1)       return `${(mm * 1000).toFixed(2)} micro-mm`;
    if (mm < 1000)    return `${mm.toFixed(3)} mm`;
    return `${(mm / 1000).toFixed(3)} m`;
}

function updateImpactPanels(co2_kg) {
    const bar = document.getElementById('impact-bar');
    if (!bar) return;
    bar.classList.remove('hidden');

    const tempDeg  = co2_kg * DEG_PER_KG;
    const seaMM    = co2_kg * MM_PER_KG;
    const budgetPct = Math.min(co2_kg / BUDGET_KG * 100, 100);

    // ── Thermometer ───────────────────────────────────────────
    document.getElementById('temp-value').textContent = fmtTemp(tempDeg);
    // Fill the thermometer tube (max height 120px svg units)
    const fillH  = Math.min(budgetPct / 100, 1) * 120;
    const fillY  = 130 - fillH;  // tube top is at y=10, bottom at y=130
    const tube   = document.getElementById('temp-tube-fill');
    if (tube) { tube.setAttribute('y', fillY); tube.setAttribute('height', fillH); }

    const pctStr = budgetPct < 0.01
        ? `<0.01% of 1.5 °C budget`
        : `${budgetPct.toFixed(2)}% of 1.5 °C budget`;
    document.getElementById('temp-sub').textContent = pctStr;

    // ── Ocean rise ────────────────────────────────────────────
    document.getElementById('ocean-value').textContent = fmtMM(seaMM);
    // Fill ocean bar — log scale so tiny amounts still show
    const logFrac  = Math.min(Math.max(Math.log10(seaMM + 1e-12) + 12, 0) / 15, 1);
    const waveH    = logFrac * 80;  // max 80 svg units
    const waveEl   = document.getElementById('ocean-wave-fill');
    if (waveEl) {
        const waveY = 160 - waveH;
        waveEl.setAttribute('d',
            `M0,${waveY} Q30,${waveY - 6} 60,${waveY} Q90,${waveY + 6} 120,${waveY} L120,160 L0,160 Z`
        );
    }
    document.getElementById('ocean-sub').textContent = 'sea level rise contribution';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOOTSTRAP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.getElementById('submit-btn').addEventListener('click', handleSubmit);
document.getElementById('main-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
});
// Randomised quick-start chips — 6 drawn at random each session
const CHIP_POOL = [
    { label: '1 yr Netflix',        value: '1 year of Netflix streaming' },
    { label: 'Mine Bitcoin',         value: 'Mining 1 Bitcoin' },
    { label: 'NYC → London',         value: 'Flying from New York to London' },
    { label: '365 Big Macs',         value: 'Eating 365 Big Macs over a year' },
    { label: 'USA Road Trip',        value: 'Road trip across the entire USA by car' },
    { label: 'Hot shower',           value: 'Taking one hot shower' },
    { label: 'SpaceX launch',        value: 'One SpaceX Falcon 9 rocket launch' },
    { label: '2 hrs TikTok',         value: 'Scrolling TikTok for 2 hours' },
    { label: 'New iPhone (2 yrs)',   value: 'Buying and using a new iPhone for 2 years' },
    { label: '100 lattes',           value: 'Drinking 100 Starbucks lattes' },
    { label: 'London → Sydney',      value: 'Flying from London to Sydney in business class' },
    { label: 'Amazon delivery',      value: 'Getting one Amazon package delivered to my home' },
    { label: '1 hr AI chatbot',      value: 'Using an AI chatbot like ChatGPT for one hour' },
    { label: 'Morning coffee',       value: 'Drinking one cup of coffee' },
    { label: 'Charge phone 1M×',     value: 'Charging a smartphone 1 million times' },
    { label: 'Beef burger',          value: 'Eating one beef burger' },
    { label: '1 hr private jet',     value: 'Flying on a private jet for one hour' },
    { label: 'Olympic pool concrete',value: 'Filling an Olympic swimming pool with concrete' },
];
function renderChips(pool) {
    const container = document.getElementById('chips-container');
    container.innerHTML = '';
    pool.forEach(({ label, value }) => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            document.getElementById('main-input').value = value;
            handleSubmit();
        });
        container.appendChild(btn);
    });
}

async function regenerateChips() {
    try {
        // We now call our OWN api/chips instead of calling Groq directly
        const res = await fetch('/api/chips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) return;
        
        const parsed = await res.json();
        const chips = Array.isArray(parsed) ? parsed : (parsed.chips ?? parsed.activities ?? []);
        
        const valid = chips.filter(c =>
            c.label && c.value &&
            typeof c.label === 'string' && typeof c.value === 'string' &&
            c.label.length >= 3 && c.label.length <= 22 &&
            !c.label.includes('chars') && !c.label.startsWith('<')
        );

        if (valid.length >= 3) renderChips(valid.slice(0, 6));
    } catch (err) {
        console.error('Chip generation failed:', err);
    }
}

(function seedChips() {
    renderChips([...CHIP_POOL].sort(() => Math.random() - 0.5).slice(0, 6));
})();
document.querySelectorAll('.freq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setFreq(parseInt(btn.dataset.freq, 10));
        clearTimeout(sliderTimer);
        if (currentData) sliderTimer = setTimeout(refreshScene, 80);
    });
});
document.getElementById('pop-slider').addEventListener('input', () => {
    document.getElementById('pop-slider-value').textContent = fmtPop(popMultiplier(popSliderVal()));
    clearTimeout(sliderTimer);
    if (currentData) sliderTimer = setTimeout(refreshScene, 80);
});
document.getElementById('avg-chip').addEventListener('click', () => {
    document.getElementById('main-input').value = "Carbon footprint of one average person's daily life — food, transport, home energy, shopping";
    handleSubmit();
});
document.getElementById('zoom-btn').addEventListener('click', () => {
    if (!currentData || !sphereGroup) return;
    const mult = combinedMultiplier();
    const r    = co2ToRadius(currentData.co2_kg * mult);
    const tier = getComparisonTier(currentData.co2_kg * mult);
    zoomToFit(layoutScene(r, tier, false));
});

function applyUnitToggle(imperial) {
    useImperial = imperial;
    document.getElementById('unit-metric').classList.toggle('active', !imperial);
    document.getElementById('unit-imperial').classList.toggle('active', imperial);
    if (!currentData) return;
    const freq    = freqVal();
    const popMult = popMultiplier(popSliderVal());
    const co2     = currentData.co2_kg * freq * popMult;
    const tier    = getComparisonTier(co2);
    updateResultsPanel(co2, tier, freq, popMult);
    // 3D labels update automatically each frame via updateLabels()
}
document.getElementById('unit-metric').addEventListener('click',   () => applyUnitToggle(false));
document.getElementById('unit-imperial').addEventListener('click', () => applyUnitToggle(true));

try { initScene(); } catch(e) { console.error('[ClimVis] 3D init failed:', e); }
