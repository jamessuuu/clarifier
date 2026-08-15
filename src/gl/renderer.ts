import { computeViewport, INK } from "@/static/renderer";

/**
 * SPEC.md §6.2: "Rendering stays WebGL2 InstancedMesh, which has far more
 * headroom... the renderer is never the bottleneck here." Raw WebGL2 (no
 * three.js or other dependency) — one instanced draw call per frame: a unit
 * quad per point, positioned by a per-instance attribute updated from
 * `sim.positions` directly (same Float32Array layout, no copy/transform).
 */

const VERTEX_SRC = `#version 300 es
uniform vec2 uScale;      // (scale, scale) in clip-space units per sim-unit
uniform vec2 uOffset;     // viewport offset in pixels
uniform vec2 uResolution; // canvas size in pixels
uniform float uPointSize; // quad half-extent in pixels

in vec2 aQuad;       // unit quad corner, [-0.5, 0.5]
in vec2 aInstancePos; // sim-space position, per instance

out vec2 vQuad;

void main() {
  vQuad = aQuad;
  vec2 screenPos = aInstancePos * uScale + uOffset + aQuad * uPointSize * 2.0;
  vec2 clip = (screenPos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 vQuad;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  float d = length(vQuad);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.42, d);
  outColor = vec4(uColor, alpha * 0.9);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("gl: could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`gl: shader compile failed: ${info ?? "unknown error"}`);
  }
  return shader;
}

export interface GLRenderer {
  render: (positions: Float32Array, n: number) => void;
  dispose: () => void;
}

export function createGLRenderer(canvas: HTMLCanvasElement): GLRenderer | null {
  const gl = canvas.getContext("webgl2");
  if (!gl) return null;

  const program = gl.createProgram();
  if (!program) return null;
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`gl: program link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  // Two triangles covering [-0.5,0.5]^2.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5]), gl.STATIC_DRAW);

  const instanceBuffer = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const aQuad = gl.getAttribLocation(program, "aQuad");
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(aQuad);
  gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);

  const aInstancePos = gl.getAttribLocation(program, "aInstancePos");
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.enableVertexAttribArray(aInstancePos);
  gl.vertexAttribPointer(aInstancePos, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(aInstancePos, 1);

  gl.bindVertexArray(null);

  const uScale = gl.getUniformLocation(program, "uScale");
  const uOffset = gl.getUniformLocation(program, "uOffset");
  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uPointSize = gl.getUniformLocation(program, "uPointSize");
  const uColor = gl.getUniformLocation(program, "uColor");
  const [r, g, b] = hexToRgb(INK);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const render = (positions: Float32Array, n: number): void => {
    const width = canvas.width;
    const height = canvas.height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.98, 0.968, 0.949, 1); // PAPER
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (n === 0) return;

    const vp = computeViewport(positions, n, width, height);

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, n * 2), gl.DYNAMIC_DRAW);

    gl.uniform2f(uScale, vp.scale, vp.scale);
    gl.uniform2f(uOffset, vp.offsetX, vp.offsetY);
    gl.uniform2f(uResolution, width, height);
    gl.uniform1f(uPointSize, 3.2 * (width / vp.width > 1 ? width / 900 : 1));
    gl.uniform3f(uColor, r, g, b);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
  };

  const dispose = (): void => {
    gl.deleteBuffer(quadBuffer);
    gl.deleteBuffer(instanceBuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  };

  return { render, dispose };
}
