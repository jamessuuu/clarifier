import { computeViewport, INK } from "@/static/renderer";

import { RENDER_WGSL } from "./kernels";

/** SPEC.md §6.1: "point-sprite render via a WebGPU render pipeline." Mirrors src/gl/renderer.ts's approach (instanced unit quad, circle cutout in the fragment shader) on the WebGPU render API instead of WebGL2's. */

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export interface GpuRenderer {
  render: (positions: Float32Array, n: number) => void;
  dispose: () => void;
}

export function createGpuRenderer(device: GPUDevice, canvas: HTMLCanvasElement): GpuRenderer | null {
  const context = canvas.getContext("webgpu");
  if (!context) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const module = device.createShaderModule({ code: RENDER_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs_main" },
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [{ format, blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } } }],
    },
    primitive: { topology: "triangle-list" },
  });

  const uniformBuffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let positionBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: { buffer: positionBuffer } }] });
  let positionBufferCapacity = 16;

  const [r, g, b] = hexToRgb(INK);

  const render = (positions: Float32Array, n: number): void => {
    const width = canvas.width;
    const height = canvas.height;
    const requiredBytes = Math.max(16, n * 2 * 4);
    if (requiredBytes > positionBufferCapacity) {
      positionBuffer.destroy();
      positionBuffer = device.createBuffer({ size: requiredBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      positionBufferCapacity = requiredBytes;
      bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: { buffer: positionBuffer } }] });
    }

    const encoder = device.createCommandEncoder();
    const view = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, clearValue: { r: 0.078, g: 0.094, b: 0.129, a: 1 }, loadOp: "clear", storeOp: "store" }] });

    if (n > 0) {
      const vp = computeViewport(positions, n, width, height);
      // `.slice()` (not `.subarray()`) guarantees a plain ArrayBuffer-backed
      // copy — GPUQueue.writeBuffer's type doesn't accept the wider
      // ArrayBufferLike a subarray view could theoretically carry.
      device.queue.writeBuffer(positionBuffer, 0, positions.slice(0, n * 2));

      const uniformData = new Float32Array(12);
      uniformData[0] = vp.scale;
      uniformData[1] = vp.scale;
      uniformData[2] = vp.offsetX;
      uniformData[3] = vp.offsetY;
      uniformData[4] = width;
      uniformData[5] = height;
      uniformData[6] = 3.2 * (width / vp.width > 1 ? width / 900 : 1);
      uniformData[7] = 0;
      uniformData[8] = r;
      uniformData[9] = g;
      uniformData[10] = b;
      uniformData[11] = 1;
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6, n);
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  const dispose = (): void => {
    uniformBuffer.destroy();
    positionBuffer.destroy();
  };

  return { render, dispose };
}
