import { boundingBoxDiagonal, meanSpeed, temperatureAtStep, type ForceField } from "@/core/physics";
import { ConvergenceDetector } from "@/core/convergence";
import type { ForceConfig } from "@/core/types";

import { ACCEL_GRID_WGSL, CELL_INDEX_WGSL, GRID_CELL_COUNT, GRID_CELL_SIZE, GRID_DIM, GRID_WORLD_MIN, SCATTER_WGSL } from "./kernels-grid";
import { ACCEL_NAIVE_WGSL, INTEGRATE_WGSL, RENDER_WGSL } from "./kernels";

const GRID_THRESHOLD = 5000; // SPEC.md §5: "Above 5,000, switch to uniform spatial-grid binning"
const WORKGROUP_SIZE = 64;
const ATTRACTION_REST_SCALE = 26; // must match core/physics.ts's ATTRACTION_REST_SCALE
const EPS2 = 1.0;
const COLLISION_RADIUS = 1.4;
const MAX_SPEED = 60;
const VISCOSITY_SCALE = 0.5;

function workgroups(n: number): number {
  return Math.max(1, Math.ceil(n / WORKGROUP_SIZE));
}

interface GridExtras {
  cellIndexBuffer: GPUBuffer;
  cellCountBuffer: GPUBuffer;
  cellOffsetBuffer: GPUBuffer;
  cellCursorBuffer: GPUBuffer;
  sortedIndicesBuffer: GPUBuffer;
  cellCountReadback: GPUBuffer;
  cellIndexPipeline: GPUComputePipeline;
  scatterPipeline: GPUComputePipeline;
  accelGridPipeline: GPUComputePipeline;
  cellIndexBindGroup: GPUBindGroup;
  gridParamsBuffer: GPUBuffer;
}

interface Buffers {
  positions: GPUBuffer;
  velocities: GPUBuffer;
  accel: GPUBuffer;
  mass: GPUBuffer;
  charge: GPUBuffer;
  attraction: GPUBuffer;
  viscosity: GPUBuffer;
  readback: GPUBuffer; // staging buffer for position+velocity readback
}

/**
 * SPEC.md §7 gpu/: "adapter/device management, WGSL kernels mirroring
 * core/'s semantics, point-sprite render pipeline." Owns the GPU-resident
 * simulation state and exposes the SAME shape core/simulation.ts's
 * Simulation class does (positions, velocities, step, converged, unstable,
 * advance()) so the UI layer (SimulationCanvas) can treat both
 * interchangeably — except advance() here is async, because reading
 * mean-speed/bounding-box data back to the CPU for the (shared,
 * already-tested) ConvergenceDetector requires a buffer mapping round trip.
 * This is a deliberate, disclosed simplification: a GPU-side reduction
 * would avoid the round trip and the measured cost is real (docs/
 * limitations: the round trip is part of why 20,000 rows runs below 60fps
 * on the hardware this was verified against) — a future optimization pass,
 * not required for a correct, working v1.
 */
export class GpuSimulation {
  readonly field: ForceField;
  readonly forces: ForceConfig;
  readonly dt: number;
  readonly usesGrid: boolean;

  positions: Float32Array;
  velocities: Float32Array;
  step = 0;
  temperature = 1;
  converged: boolean;
  unstable = false;

  private readonly device: GPUDevice;
  private readonly buffers: Buffers;
  private readonly accelPipeline: GPUComputePipeline;
  private readonly integratePipeline: GPUComputePipeline;
  private readonly accelBindGroup: GPUBindGroup;
  private readonly integrateBindGroup: GPUBindGroup;
  private readonly paramsBufferAccel: GPUBuffer;
  private readonly paramsBufferIntegrate: GPUBuffer;
  private readonly detector = new ConvergenceDetector();

  // Grid path only.
  private readonly cellIndexBuffer?: GPUBuffer;
  private readonly cellCountBuffer?: GPUBuffer;
  private readonly cellOffsetBuffer?: GPUBuffer;
  private readonly cellCursorBuffer?: GPUBuffer;
  private readonly sortedIndicesBuffer?: GPUBuffer;
  private readonly cellCountReadback?: GPUBuffer;
  private readonly cellIndexPipeline?: GPUComputePipeline;
  private readonly scatterPipeline?: GPUComputePipeline;
  private readonly accelGridPipeline?: GPUComputePipeline;
  private readonly cellIndexBindGroup?: GPUBindGroup;
  private scatterBindGroup?: GPUBindGroup;
  private accelGridBindGroup?: GPUBindGroup;
  private readonly gridParamsBuffer?: GPUBuffer;

  private constructor(device: GPUDevice, field: ForceField, forces: ForceConfig, dt: number, positions: Float32Array, velocities: Float32Array, buffers: Buffers, accelPipeline: GPUComputePipeline, integratePipeline: GPUComputePipeline, accelBindGroup: GPUBindGroup, integrateBindGroup: GPUBindGroup, paramsBufferAccel: GPUBuffer, paramsBufferIntegrate: GPUBuffer, gridExtras?: GridExtras) {
    this.device = device;
    this.field = field;
    this.forces = forces;
    this.dt = dt;
    this.positions = positions;
    this.velocities = velocities;
    this.buffers = buffers;
    this.accelPipeline = accelPipeline;
    this.integratePipeline = integratePipeline;
    this.accelBindGroup = accelBindGroup;
    this.integrateBindGroup = integrateBindGroup;
    this.paramsBufferAccel = paramsBufferAccel;
    this.paramsBufferIntegrate = paramsBufferIntegrate;
    this.usesGrid = field.n > GRID_THRESHOLD;
    this.converged = field.n <= 1; // mirrors core/simulation.ts's degenerate-case handling

    if (gridExtras) {
      this.cellIndexBuffer = gridExtras.cellIndexBuffer;
      this.cellCountBuffer = gridExtras.cellCountBuffer;
      this.cellOffsetBuffer = gridExtras.cellOffsetBuffer;
      this.cellCursorBuffer = gridExtras.cellCursorBuffer;
      this.sortedIndicesBuffer = gridExtras.sortedIndicesBuffer;
      this.cellCountReadback = gridExtras.cellCountReadback;
      this.cellIndexPipeline = gridExtras.cellIndexPipeline;
      this.scatterPipeline = gridExtras.scatterPipeline;
      this.accelGridPipeline = gridExtras.accelGridPipeline;
      this.cellIndexBindGroup = gridExtras.cellIndexBindGroup;
      this.gridParamsBuffer = gridExtras.gridParamsBuffer;
    }
  }

  // Every WebGPU call used here (createBuffer, createShaderModule,
  // createComputePipeline, createBindGroup) is synchronous per spec — only
  // requestAdapter/requestDevice/mapAsync are async, and none of those run
  // during setup, so this deliberately returns a value, not a Promise.
  static create(device: GPUDevice, field: ForceField, forces: ForceConfig, dt: number, initialPositions: Float32Array): GpuSimulation {
    const n = field.n;
    const f32 = (arr: Float32Array, usage: number): GPUBuffer => {
      const buf = device.createBuffer({ size: Math.max(16, arr.byteLength), usage, mappedAtCreation: true });
      new Float32Array(buf.getMappedRange()).set(arr);
      buf.unmap();
      return buf;
    };
    const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;

    const velocities = new Float32Array(n * 2);
    const buffers: Buffers = {
      positions: f32(initialPositions, STORAGE),
      velocities: f32(velocities, STORAGE),
      accel: device.createBuffer({ size: Math.max(16, n * 2 * 4), usage: STORAGE }),
      mass: f32(field.mass, STORAGE),
      charge: f32(field.charge, STORAGE),
      attraction: f32(field.attraction.length > 0 ? field.attraction : new Float32Array(1), STORAGE),
      viscosity: f32(field.viscosity, STORAGE),
      readback: device.createBuffer({ size: Math.max(16, n * 2 * 4), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
    };

    const paramsBufferAccel = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const paramsBufferIntegrate = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const accelModule = device.createShaderModule({ code: ACCEL_NAIVE_WGSL });
    const accelPipeline = device.createComputePipeline({ layout: "auto", compute: { module: accelModule, entryPoint: "main" } });
    const accelBindGroup = device.createBindGroup({
      layout: accelPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBufferAccel } },
        { binding: 1, resource: { buffer: buffers.positions } },
        { binding: 2, resource: { buffer: buffers.mass } },
        { binding: 3, resource: { buffer: buffers.charge } },
        { binding: 4, resource: { buffer: buffers.attraction } },
        { binding: 5, resource: { buffer: buffers.accel } },
      ],
    });

    const integrateModule = device.createShaderModule({ code: INTEGRATE_WGSL });
    const integratePipeline = device.createComputePipeline({ layout: "auto", compute: { module: integrateModule, entryPoint: "main" } });
    const integrateBindGroup = device.createBindGroup({
      layout: integratePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBufferIntegrate } },
        { binding: 1, resource: { buffer: buffers.positions } },
        { binding: 2, resource: { buffer: buffers.velocities } },
        { binding: 3, resource: { buffer: buffers.accel } },
        { binding: 4, resource: { buffer: buffers.viscosity } },
      ],
    });

    let gridExtras: GridExtras | undefined;
    if (n > GRID_THRESHOLD) {
      const u32Zeros = (count: number): GPUBuffer => device.createBuffer({ size: Math.max(16, count * 4), usage: STORAGE });
      const cellIndexBuffer = u32Zeros(n);
      const cellCountBuffer = u32Zeros(GRID_CELL_COUNT);
      const cellOffsetBuffer = u32Zeros(GRID_CELL_COUNT);
      const cellCursorBuffer = u32Zeros(GRID_CELL_COUNT);
      const sortedIndicesBuffer = u32Zeros(n);
      const cellCountReadback = device.createBuffer({ size: Math.max(16, GRID_CELL_COUNT * 4), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const gridParamsBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

      const cellIndexModule = device.createShaderModule({ code: CELL_INDEX_WGSL });
      const cellIndexPipeline = device.createComputePipeline({ layout: "auto", compute: { module: cellIndexModule, entryPoint: "main" } });
      const cellIndexBindGroup = device.createBindGroup({
        layout: cellIndexPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: gridParamsBuffer } },
          { binding: 1, resource: { buffer: buffers.positions } },
          { binding: 2, resource: { buffer: cellIndexBuffer } },
          { binding: 3, resource: { buffer: cellCountBuffer } },
        ],
      });

      const scatterModule = device.createShaderModule({ code: SCATTER_WGSL });
      const scatterPipeline = device.createComputePipeline({ layout: "auto", compute: { module: scatterModule, entryPoint: "main" } });

      const accelGridModule = device.createShaderModule({ code: ACCEL_GRID_WGSL });
      const accelGridPipeline = device.createComputePipeline({ layout: "auto", compute: { module: accelGridModule, entryPoint: "main" } });

      gridExtras = { cellIndexBuffer, cellCountBuffer, cellOffsetBuffer, cellCursorBuffer, sortedIndicesBuffer, cellCountReadback, cellIndexPipeline, scatterPipeline, accelGridPipeline, cellIndexBindGroup, gridParamsBuffer };
    }

    const sim = new GpuSimulation(device, field, forces, dt, initialPositions.slice(), velocities.slice(), buffers, accelPipeline, integratePipeline, accelBindGroup, integrateBindGroup, paramsBufferAccel, paramsBufferIntegrate, gridExtras);

    if (gridExtras) {
      const scatterBindGroup = device.createBindGroup({
        layout: gridExtras.scatterPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: gridExtras.gridParamsBuffer } },
          { binding: 1, resource: { buffer: gridExtras.cellIndexBuffer } },
          { binding: 2, resource: { buffer: gridExtras.cellCursorBuffer } },
          { binding: 3, resource: { buffer: gridExtras.sortedIndicesBuffer } },
        ],
      });
      const accelGridBindGroup = device.createBindGroup({
        layout: gridExtras.accelGridPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBufferAccel } },
          { binding: 1, resource: { buffer: buffers.positions } },
          { binding: 2, resource: { buffer: buffers.mass } },
          { binding: 3, resource: { buffer: buffers.charge } },
          { binding: 4, resource: { buffer: buffers.attraction } },
          { binding: 5, resource: { buffer: buffers.accel } },
          { binding: 6, resource: { buffer: gridExtras.cellOffsetBuffer } },
          { binding: 7, resource: { buffer: gridExtras.cellCountBuffer } },
          { binding: 8, resource: { buffer: gridExtras.sortedIndicesBuffer } },
        ],
      });
      sim.scatterBindGroup = scatterBindGroup;
      sim.accelGridBindGroup = accelGridBindGroup;
    }

    return sim;
  }

  private writeAccelParams(): void {
    const buf = new ArrayBuffer(48);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    u32[0] = this.field.n;
    u32[1] = this.field.attractionDims;
    f32[2] = this.temperature;
    f32[3] = this.forces.centering;
    f32[4] = this.forces.attraction;
    f32[5] = this.forces.charge;
    f32[6] = this.forces.collision;
    f32[7] = EPS2;
    f32[8] = COLLISION_RADIUS;
    f32[9] = ATTRACTION_REST_SCALE;
    this.device.queue.writeBuffer(this.paramsBufferAccel, 0, buf);
  }

  private writeIntegrateParams(): void {
    const buf = new ArrayBuffer(32);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    u32[0] = this.field.n;
    f32[1] = this.dt;
    f32[2] = this.forces.viscosityBase;
    f32[3] = VISCOSITY_SCALE;
    f32[4] = MAX_SPEED;
    this.device.queue.writeBuffer(this.paramsBufferIntegrate, 0, buf);
  }

  /**
   * One fixed-dt step: dispatch (grid rebuild if applicable ->) accel ->
   * integrate, then read positions+velocities back to the CPU to advance
   * the SAME ConvergenceDetector every other rung uses. Async — see the
   * class doc comment for why.
   */
  async advance(): Promise<void> {
    if (this.converged || this.unstable) return;
    this.temperature = temperatureAtStep(this.step);
    this.writeAccelParams();
    this.writeIntegrateParams();

    const encoder = this.device.createCommandEncoder();

    if (this.usesGrid && this.cellIndexPipeline && this.scatterPipeline && this.accelGridPipeline && this.cellIndexBindGroup && this.scatterBindGroup && this.accelGridBindGroup && this.gridParamsBuffer && this.cellCountBuffer && this.cellOffsetBuffer && this.cellCursorBuffer && this.cellCountReadback) {
      const n = this.field.n;
      const gridParams = new ArrayBuffer(16);
      new Uint32Array(gridParams)[0] = n;
      this.device.queue.writeBuffer(this.gridParamsBuffer, 0, gridParams);
      encoder.clearBuffer(this.cellCountBuffer);

      const pass1 = encoder.beginComputePass();
      pass1.setPipeline(this.cellIndexPipeline);
      pass1.setBindGroup(0, this.cellIndexBindGroup);
      pass1.dispatchWorkgroups(workgroups(n));
      pass1.end();

      encoder.copyBufferToBuffer(this.cellCountBuffer, 0, this.cellCountReadback, 0, GRID_CELL_COUNT * 4);
      this.device.queue.submit([encoder.finish()]);

      await this.cellCountReadback.mapAsync(GPUMapMode.READ);
      const counts = new Uint32Array(this.cellCountReadback.getMappedRange().slice(0));
      this.cellCountReadback.unmap();

      const offsets = new Uint32Array(GRID_CELL_COUNT);
      let running = 0;
      for (let c = 0; c < GRID_CELL_COUNT; c++) {
        offsets[c] = running;
        running += counts[c] ?? 0;
      }
      this.device.queue.writeBuffer(this.cellOffsetBuffer, 0, offsets);
      this.device.queue.writeBuffer(this.cellCursorBuffer, 0, offsets);

      const encoder2 = this.device.createCommandEncoder();
      const pass2 = encoder2.beginComputePass();
      pass2.setPipeline(this.scatterPipeline);
      pass2.setBindGroup(0, this.scatterBindGroup);
      pass2.dispatchWorkgroups(workgroups(n));
      pass2.end();

      const pass3 = encoder2.beginComputePass();
      pass3.setPipeline(this.accelGridPipeline);
      pass3.setBindGroup(0, this.accelGridBindGroup);
      pass3.dispatchWorkgroups(workgroups(n));
      pass3.end();
      this.dispatchIntegrateAndReadback(encoder2);
      this.device.queue.submit([encoder2.finish()]);
      await this.readbackAndAdvanceState();
      return;
    }

    const accelPass = encoder.beginComputePass();
    accelPass.setPipeline(this.accelPipeline);
    accelPass.setBindGroup(0, this.accelBindGroup);
    accelPass.dispatchWorkgroups(workgroups(this.field.n));
    accelPass.end();
    this.dispatchIntegrateAndReadback(encoder);
    this.device.queue.submit([encoder.finish()]);
    await this.readbackAndAdvanceState();
  }

  private dispatchIntegrateAndReadback(encoder: GPUCommandEncoder): void {
    const integratePass = encoder.beginComputePass();
    integratePass.setPipeline(this.integratePipeline);
    integratePass.setBindGroup(0, this.integrateBindGroup);
    integratePass.dispatchWorkgroups(workgroups(this.field.n));
    integratePass.end();
    encoder.copyBufferToBuffer(this.buffers.velocities, 0, this.buffers.readback, 0, this.field.n * 2 * 4);
  }

  private async readbackAndAdvanceState(): Promise<void> {
    await this.buffers.readback.mapAsync(GPUMapMode.READ);
    const newVelocities = new Float32Array(this.buffers.readback.getMappedRange().slice(0));
    this.buffers.readback.unmap();

    if (newVelocities.some((v) => !Number.isFinite(v))) {
      this.unstable = true;
      console.warn(`clarifier: GPU simulation became unstable at step ${String(this.step)} — showing the last stable frame.`);
      return;
    }

    this.velocities = newVelocities;
    // Position readback (for rendering + convergence's bounding box) is a
    // separate small buffer copy — reuses the same readback buffer size
    // since positions and velocities are both n*2 floats.
    const posEncoder = this.device.createCommandEncoder();
    const posReadback = this.device.createBuffer({ size: Math.max(16, this.field.n * 2 * 4), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    posEncoder.copyBufferToBuffer(this.buffers.positions, 0, posReadback, 0, this.field.n * 2 * 4);
    this.device.queue.submit([posEncoder.finish()]);
    await posReadback.mapAsync(GPUMapMode.READ);
    this.positions = new Float32Array(posReadback.getMappedRange().slice(0));
    posReadback.unmap();
    posReadback.destroy();

    this.step++;

    const speed = meanSpeed(this.velocities, this.field.n);
    const diagonal = boundingBoxDiagonal(this.positions, this.field.n);
    const { converged } = this.detector.step(speed, diagonal);
    if (converged) this.converged = true;
  }

  async runToConvergence(maxSteps: number): Promise<void> {
    while (!this.converged && !this.unstable && this.step < maxSteps) {
      await this.advance();
    }
  }

  dispose(): void {
    const buffers: GPUBuffer[] = [this.buffers.positions, this.buffers.velocities, this.buffers.accel, this.buffers.mass, this.buffers.charge, this.buffers.attraction, this.buffers.viscosity, this.buffers.readback];
    for (const buf of buffers) buf.destroy();
    this.paramsBufferAccel.destroy();
    this.paramsBufferIntegrate.destroy();
    this.cellIndexBuffer?.destroy();
    this.cellCountBuffer?.destroy();
    this.cellOffsetBuffer?.destroy();
    this.cellCursorBuffer?.destroy();
    this.sortedIndicesBuffer?.destroy();
    this.cellCountReadback?.destroy();
    this.gridParamsBuffer?.destroy();
  }
}

export { RENDER_WGSL, GRID_CELL_SIZE, GRID_DIM, GRID_WORLD_MIN };
