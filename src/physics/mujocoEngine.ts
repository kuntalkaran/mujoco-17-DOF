/**
 * Official Google DeepMind MuJoCo WebAssembly Engine Wrapper
 * Runs exact MuJoCo C/C++ physics simulation in the browser.
 */
import { GYMNASIUM_HUMANOID_XML } from './humanoidGymXml';

export interface GeomVisualData {
  id: number;
  bodyId: number;
  type: number; // 0=plane, 2=sphere, 3=capsule, 5=cylinder, 6=box
  size: [number, number, number];
  rgba: [number, number, number, number];
  name: string;
}

export class MujocoSimulation {
  private mj: any = null;
  public model: any = null;
  public data: any = null;
  public isReady: boolean = false;
  public geomList: GeomVisualData[] = [];
  public actuatorNames: string[] = [];

  private defaultQpos: Float64Array | null = null;
  private defaultQvel: Float64Array | null = null;

  async init(xmlString: string = GYMNASIUM_HUMANOID_XML) {
    try {
      const mujocoModule = await import('@mujoco/mujoco');
      const loadMujoco = mujocoModule.default || mujocoModule;

      this.mj = await (loadMujoco as any)({
        locateFile: (file: string) => {
          if (file.endsWith('.wasm')) {
            return '/mujoco.wasm';
          }
          return file;
        },
      });

      // Load model directly from XML
      this.model = this.mj.MjModel.from_xml_string(xmlString);
      this.data = new this.mj.MjData(this.model);

      // Save initial state for instantaneous reset
      this.defaultQpos = new Float64Array(this.data.qpos);
      this.defaultQvel = new Float64Array(this.data.qvel);

      // Parse metadata
      this.parseModelMetadata();
      this.isReady = true;

      return true;
    } catch (err) {
      console.error('Failed to initialize MuJoCo WASM:', err);
      throw err;
    }
  }

  private parseModelMetadata() {
    this.geomList = [];
    const ngeom = this.model.ngeom;

    for (let i = 0; i < ngeom; i++) {
      const type = this.model.geom_type[i];
      const bodyId = this.model.geom_bodyid ? this.model.geom_bodyid[i] : 1;
      const size: [number, number, number] = [
        this.model.geom_size[i * 3 + 0],
        this.model.geom_size[i * 3 + 1],
        this.model.geom_size[i * 3 + 2],
      ];
      const rgba: [number, number, number, number] = [
        this.model.geom_rgba[i * 4 + 0],
        this.model.geom_rgba[i * 4 + 1],
        this.model.geom_rgba[i * 4 + 2],
        this.model.geom_rgba[i * 4 + 3],
      ];

      let name = `geom_${i}`;
      try {
        if (this.mj.mj_id2name) {
          name = this.mj.mj_id2name(this.model, this.mj.mjtObj.mjOBJ_GEOM, i) || name;
        }
      } catch {
        // fallback
      }

      this.geomList.push({ id: i, bodyId, type, size, rgba, name });
    }

    // Actuators
    this.actuatorNames = [];
    const nu = this.model.nu;
    for (let i = 0; i < nu; i++) {
      let name = `actuator_${i}`;
      try {
        if (this.mj.mj_id2name) {
          name = this.mj.mj_id2name(this.model, this.mj.mjtObj.mjOBJ_ACTUATOR, i) || name;
        }
      } catch {
        // fallback
      }
      this.actuatorNames.push(name);
    }
  }

  step(substeps: number = 4) {
    if (!this.isReady || !this.model || !this.data) return;
    for (let i = 0; i < substeps; i++) {
      this.mj.mj_step(this.model, this.data);
    }
  }

  reset(dropHeight: number = 1.4) {
    if (!this.isReady || !this.model || !this.data) return;
    if (this.defaultQpos) {
      this.data.qpos.set(this.defaultQpos);
      if (this.model.nq >= 3) {
        this.data.qpos[2] = dropHeight;
      }
    }
    if (this.defaultQvel) {
      this.data.qvel.set(this.defaultQvel);
    }
    if (this.data.ctrl) {
      this.data.ctrl.fill(0);
    }
    if (this.data.qfrc_applied) {
      this.data.qfrc_applied.fill(0);
    }
    if (this.data.xfrc_applied) {
      this.data.xfrc_applied.fill(0);
    }
    this.mj.mj_forward(this.model, this.data);
  }

  /**
   * Apply a strong, smooth spring-damper pulling force to a grabbed body towards target 3D point
   */
  applySpringForce(bodyId: number, targetPos: [number, number, number], kp: number = 600, kd: number = 25) {
    if (!this.isReady || !this.data || !this.data.xfrc_applied) return;
    if (bodyId <= 0 || bodyId >= this.model.nbody) return;

    const bIdx = bodyId * 3;
    const curX = this.data.xpos[bIdx + 0];
    const curY = this.data.xpos[bIdx + 1];
    const curZ = this.data.xpos[bIdx + 2];

    const dx = targetPos[0] - curX;
    const dy = targetPos[1] - curY;
    const dz = targetPos[2] - curZ;

    // Proportional pulling force
    const fx = dx * kp;
    const fy = dy * kp;
    const fz = dz * kp;

    const fIdx = bodyId * 6;
    this.data.xfrc_applied[fIdx + 0] = fx;
    this.data.xfrc_applied[fIdx + 1] = fy;
    this.data.xfrc_applied[fIdx + 2] = fz;
  }

  applyImpulse(bodyId: number = 1, forceX: number = 0, forceY: number = 0, forceZ: number = 0) {
    if (!this.isReady || !this.data || !this.data.xfrc_applied) return;
    const offset = bodyId * 6;
    if (offset + 2 < this.data.xfrc_applied.length) {
      this.data.xfrc_applied[offset + 0] = forceX;
      this.data.xfrc_applied[offset + 1] = forceY;
      this.data.xfrc_applied[offset + 2] = forceZ;
    }
  }

  clearAppliedForces() {
    if (!this.isReady || !this.data || !this.data.xfrc_applied) return;
    this.data.xfrc_applied.fill(0);
  }

  setCtrl(actuatorIdx: number, value: number) {
    if (!this.isReady || !this.data || !this.data.ctrl) return;
    if (actuatorIdx >= 0 && actuatorIdx < this.data.ctrl.length) {
      this.data.ctrl[actuatorIdx] = value;
    }
  }

  getGeomPos(geomIndex: number): [number, number, number] {
    if (!this.data || !this.data.geom_xpos) return [0, 0, 0];
    const idx = geomIndex * 3;
    return [
      this.data.geom_xpos[idx],
      this.data.geom_xpos[idx + 1],
      this.data.geom_xpos[idx + 2],
    ];
  }

  getBodyPos(bodyId: number): [number, number, number] {
    if (!this.data || !this.data.xpos) return [0, 0, 0];
    const idx = bodyId * 3;
    return [
      this.data.xpos[idx],
      this.data.xpos[idx + 1],
      this.data.xpos[idx + 2],
    ];
  }

  getGeomMat(geomIndex: number): Float64Array | number[] {
    if (!this.data || !this.data.geom_xmat) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const idx = geomIndex * 9;
    return this.data.geom_xmat.subarray(idx, idx + 9);
  }

  getCenterOfMass(): [number, number, number] {
    if (!this.data || !this.data.subtree_com) {
      return this.getGeomPos(1);
    }
    return [
      this.data.subtree_com[0],
      this.data.subtree_com[1],
      this.data.subtree_com[2],
    ];
  }
}
