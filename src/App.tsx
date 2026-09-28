/**
 * MuJoCo Humanoid 17-DOF Physics Simulator
 * Direct Gymnasium XML & DeepMind MuJoCo WebAssembly Engine
 */
import React from 'react';
import { MujocoViewer } from './components/MujocoViewer';

export default function App() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-[#0a0a0c]">
      <MujocoViewer />
    </main>
  );
}
