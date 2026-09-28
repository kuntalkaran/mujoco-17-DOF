/**
 * Real MuJoCo Humanoid 3D Viewport with Three.js
 * Official DeepMind MuJoCo engine with iconic orange model tone, black floor, orange boundary,
 * pure natural physics simulation (no manual grabbing/lifting), and clean minimal controls.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { MujocoSimulation } from '../physics/mujocoEngine';
import { Play, Pause, RotateCcw } from 'lucide-react';

export const MujocoViewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<MujocoSimulation | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);

  // Pure camera mouse navigation state (No limb grabbing/lifting)
  const mouseState = useRef({
    isMouseDown: false,
    button: 0,
    prevX: 0,
    prevY: 0,
  });

  const cameraState = useRef({
    distance: 3.6,
    theta: -Math.PI / 2, // azimuth
    phi: Math.PI / 3,    // elevation
    target: new THREE.Vector3(0, 0, 1.0),
  });

  const meshesRef = useRef<THREE.Mesh[]>([]);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Initialize MuJoCo & Three.js
  useEffect(() => {
    let isMounted = true;

    async function initSim() {
      if (!containerRef.current) return;

      const sim = new MujocoSimulation();
      await sim.init();
      if (!isMounted) return;
      simRef.current = sim;

      // Set Three.js UP axis to +Z to align 1:1 with MuJoCo coordinate frame
      THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

      // 1. Create Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0c); // Deep matte black
      scene.fog = new THREE.FogExp2(0x0a0a0c, 0.04);
      sceneRef.current = scene;

      // 2. Create Camera
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.up.set(0, 0, 1);
      cameraRef.current = camera;

      // 3. Create WebGL Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // --- ENVIRONMENT SETUP ---
      // Black Ground (Jameen)
      const floorSize = 16;
      const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize, 32, 32);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x111115,
        roughness: 0.85,
        metalness: 0.1,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      // Fine coordinate grid on floor
      const grid = new THREE.GridHelper(floorSize, 32, 0x333340, 0x1a1a20);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = 0.001;
      scene.add(grid);

      // Orange Boundary (Boundry orange colour ki)
      const boundaryRadius = floorSize / 2;
      const orangeColor = 0xff6600;

      // Glowing orange perimeter floor border
      const borderPoints = [
        new THREE.Vector3(-boundaryRadius, -boundaryRadius, 0.02),
        new THREE.Vector3(boundaryRadius, -boundaryRadius, 0.02),
        new THREE.Vector3(boundaryRadius, boundaryRadius, 0.02),
        new THREE.Vector3(-boundaryRadius, boundaryRadius, 0.02),
        new THREE.Vector3(-boundaryRadius, -boundaryRadius, 0.02),
      ];
      const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
      const borderMat = new THREE.LineBasicMaterial({ color: orangeColor, linewidth: 3 });
      const borderLine = new THREE.Line(borderGeo, borderMat);
      scene.add(borderLine);

      // Orange perimeter safety rails
      const railHeight = 0.35;
      const railMat = new THREE.MeshStandardMaterial({
        color: orangeColor,
        roughness: 0.25,
        metalness: 0.4,
        emissive: 0xff4400,
        emissiveIntensity: 0.35,
      });

      const sideLength = floorSize;
      const wallThickness = 0.08;

      const northRail = new THREE.Mesh(new THREE.BoxGeometry(sideLength, wallThickness, railHeight), railMat);
      northRail.position.set(0, boundaryRadius, railHeight / 2);
      northRail.castShadow = true;
      scene.add(northRail);

      const southRail = new THREE.Mesh(new THREE.BoxGeometry(sideLength, wallThickness, railHeight), railMat);
      southRail.position.set(0, -boundaryRadius, railHeight / 2);
      southRail.castShadow = true;
      scene.add(southRail);

      const eastRail = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, sideLength, railHeight), railMat);
      eastRail.position.set(boundaryRadius, 0, railHeight / 2);
      eastRail.castShadow = true;
      scene.add(eastRail);

      const westRail = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, sideLength, railHeight), railMat);
      westRail.position.set(-boundaryRadius, 0, railHeight / 2);
      westRail.castShadow = true;
      scene.add(westRail);

      // Corner orange beacons
      const beaconGeo = new THREE.CylinderGeometry(0.12, 0.12, railHeight * 1.5, 16);
      beaconGeo.rotateX(Math.PI / 2);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0xff7700,
        emissive: 0xff5500,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      });
      [
        [-boundaryRadius, -boundaryRadius],
        [boundaryRadius, -boundaryRadius],
        [boundaryRadius, boundaryRadius],
        [-boundaryRadius, boundaryRadius],
      ].forEach(([x, y]) => {
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(x, y, (railHeight * 1.5) / 2);
        scene.add(beacon);
      });

      // --- LIGHTING ---
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xfff5ea, 1.9);
      dirLight.position.set(4, -5, 8);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 25;
      dirLight.shadow.camera.left = -6;
      dirLight.shadow.camera.right = 6;
      dirLight.shadow.camera.top = 6;
      dirLight.shadow.camera.bottom = -6;
      dirLight.shadow.bias = -0.0005;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0x7799bb, 0.6);
      fillLight.position.set(-5, 4, 4);
      scene.add(fillLight);

      // --- CREATE HUMANOID 3D GEOMETRIES (REAL MUJOCO ORANGE COLOR) ---
      const humanoidMeshes: THREE.Mesh[] = [];
      const modelOrangeColor = new THREE.Color(0xe06822); // Real iconic MuJoCo humanoid orange tone

      // Loop through geoms (skip floor 0)
      for (let i = 1; i < sim.geomList.length; i++) {
        const g = sim.geomList[i];
        let geometry: THREE.BufferGeometry;

        if (g.type === 2) {
          // Sphere (Head, Hands, Feet)
          geometry = new THREE.SphereGeometry(g.size[0], 32, 32);
        } else if (g.type === 3) {
          // Capsule (Torso, Waist, Pelvis, Thighs, Shins, Arms)
          const radius = g.size[0];
          const halfLength = g.size[1];
          geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, halfLength * 2), 12, 24);
          geometry.rotateX(Math.PI / 2);
        } else if (g.type === 5) {
          // Cylinder
          geometry = new THREE.CylinderGeometry(g.size[0], g.size[0], Math.max(0.001, g.size[1] * 2), 24);
          geometry.rotateX(Math.PI / 2);
        } else {
          // Box
          geometry = new THREE.BoxGeometry(g.size[0] * 2, g.size[1] * 2, g.size[2] * 2);
        }

        const material = new THREE.MeshStandardMaterial({
          color: modelOrangeColor,
          roughness: 0.35,
          metalness: 0.15,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData = { geomIndex: i, bodyId: g.bodyId, geomName: g.name };

        scene.add(mesh);
        humanoidMeshes.push(mesh);
      }

      meshesRef.current = humanoidMeshes;
      setIsLoading(false);

      // --- ANIMATION & PHYSICS LOOP ---
      const matrixHelper = new THREE.Matrix4();

      function updateCamera() {
        if (!cameraRef.current) return;
        const cam = cameraRef.current;
        const cs = cameraState.current;

        const x = cs.target.x + cs.distance * Math.sin(cs.phi) * Math.cos(cs.theta);
        const y = cs.target.y + cs.distance * Math.sin(cs.phi) * Math.sin(cs.theta);
        const z = cs.target.z + cs.distance * Math.cos(cs.phi);

        cam.position.set(x, y, z);
        cam.lookAt(cs.target);
      }

      function renderLoop() {
        if (simRef.current && simRef.current.isReady) {
          // Step pure natural MuJoCo physics
          if (isPlaying) {
            simRef.current.step(4); // 4 substeps of 0.003s = 0.012s physics
          }

          // Update meshes from MuJoCo kinematics
          const meshes = meshesRef.current;
          for (let k = 0; k < meshes.length; k++) {
            const mesh = meshes[k];
            const geomIdx = mesh.userData.geomIndex;
            const mat = simRef.current.getGeomMat(geomIdx);
            const pos = simRef.current.getGeomPos(geomIdx);

            matrixHelper.set(
              mat[0], mat[1], mat[2], pos[0],
              mat[3], mat[4], mat[5], pos[1],
              mat[6], mat[7], mat[8], pos[2],
              0, 0, 0, 1
            );
            mesh.matrix.copy(matrixHelper);
          }

          // Camera ALWAYS tracks the humanoid model smoothly
          const com = simRef.current.getCenterOfMass();
          cameraState.current.target.lerp(
            new THREE.Vector3(com[0], com[1], Math.max(0.35, com[2])),
            0.05
          );
        }

        updateCamera();
        renderer.render(scene, camera);
        animFrameId.current = requestAnimationFrame(renderLoop);
      }

      renderLoop();

      // Window resize listener
      const handleResize = () => {
        if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    initSim();

    return () => {
      isMounted = false;
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [isPlaying]);

  // --- CAMERA MOUSE CONTROLS (PURE ORBIT, PAN, ZOOM) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseState.current.isMouseDown = true;
    mouseState.current.button = e.button;
    mouseState.current.prevX = e.clientX;
    mouseState.current.prevY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const ms = mouseState.current;
    if (!ms.isMouseDown) return;

    const dx = e.clientX - ms.prevX;
    const dy = e.clientY - ms.prevY;
    ms.prevX = e.clientX;
    ms.prevY = e.clientY;

    const cs = cameraState.current;

    // Right Click OR Shift + Left Click = PAN
    if (ms.button === 2 || (ms.button === 0 && e.shiftKey)) {
      const panSpeed = 0.003 * cs.distance;
      const rightX = -Math.sin(cs.theta);
      const rightY = Math.cos(cs.theta);

      cs.target.x -= rightX * dx * panSpeed;
      cs.target.y -= rightY * dx * panSpeed;
      cs.target.z += dy * panSpeed;
    }
    // Left Click = ORBIT ROTATE
    else if (ms.button === 0) {
      const rotSpeed = 0.006;
      cs.theta -= dx * rotSpeed;
      cs.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.01, cs.phi - dy * rotSpeed));
    }
  };

  const handleMouseUp = () => {
    mouseState.current.isMouseDown = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    cameraState.current.distance = Math.max(1.0, Math.min(15.0, cameraState.current.distance * zoomFactor));
  };

  // --- ACTIONS ---
  const handleReset = useCallback(() => {
    if (simRef.current) {
      simRef.current.reset(1.4);
    }
  }, []);

  return (
    <div className="relative w-full h-full bg-[#0a0a0c] overflow-hidden select-none">
      {/* 3D Canvas */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#0a0a0c]/90 backdrop-blur-md flex flex-col items-center justify-center text-white z-50">
          <div className="w-12 h-12 border-4 border-[#ff6600]/30 border-t-[#ff6600] rounded-full animate-spin mb-4" />
          <h2 className="text-xl font-bold tracking-wider text-neutral-100">LOADING MUJOCO WASM ENGINE</h2>
          <p className="text-sm text-neutral-400 mt-2 font-mono">Compiling Gymnasium Humanoid-v4 model...</p>
        </div>
      )}

      {/* ULTRA-CLEAN FLOATING CONTROLS (SIMULATE & RESET ONLY) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-[#121218]/90 border border-neutral-800/80 backdrop-blur-xl p-2 rounded-2xl shadow-2xl z-20 pointer-events-auto">
        {/* Play/Pause */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? 'Pause simulation' : 'Play simulation'}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            isPlaying
              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
              : 'bg-[#ff6600] hover:bg-[#ff7711] text-white shadow-lg shadow-[#ff6600]/25'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{isPlaying ? 'Pause' : 'Simulate'}</span>
        </button>

        {/* Reset Icon Button (Symbol only) */}
        <button
          onClick={handleReset}
          title="Reset Pose"
          className="p-2.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-all flex items-center justify-center"
        >
          <RotateCcw className="w-4 h-4 text-[#ff6600]" />
        </button>
      </div>
    </div>
  );
};
