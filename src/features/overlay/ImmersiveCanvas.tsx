import { useEffect, useRef } from "react";
import { desktopBridge } from "../bridge/desktopBridge";
import type { EpisodePlan, Rect } from "../domain/types";

const CAPTURE_TIMEOUT_MS = 200;
const MAX_CAPTURE_PIXELS = 1_500_000;
const EFFECT_DURATION_MS = 2_350;

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 1.0 - (a_position.y * 0.5 + 0.5));
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_frame;
uniform float u_time;
uniform float u_seed;
in vec2 v_uv;
out vec4 out_color;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453);
}

float crack(vec2 uv, float offset) {
  float center = 0.52 + sin(uv.y * 17.0 + offset + u_seed) * 0.045;
  center += (hash(vec2(floor(uv.y * 14.0), offset)) - 0.5) * 0.045;
  return smoothstep(0.012, 0.0015, abs(uv.x - center));
}

void main() {
  float appear = smoothstep(0.0, 0.18, u_time);
  float release = 1.0 - smoothstep(0.72, 1.0, u_time);
  float strength = appear * release;
  float main_crack = crack(v_uv, 0.0);
  float branch_a = crack(vec2(v_uv.y * 1.14 - 0.18, v_uv.x), 2.4) * step(0.48, v_uv.y);
  float branch_b = crack(vec2(1.0 - v_uv.y, v_uv.x * 1.3), 5.1) * step(v_uv.y, 0.57);
  float crack_mask = clamp(main_crack + branch_a * 0.64 + branch_b * 0.54, 0.0, 1.0);
  vec2 away = normalize(v_uv - vec2(0.52, 0.5) + vec2(0.0001));
  float wobble = sin(v_uv.y * 28.0 + u_time * 18.0 + u_seed) * 0.005;
  vec2 displaced_uv = clamp(v_uv + away * strength * 0.018 + vec2(wobble * strength, 0.0), 0.002, 0.998);
  vec4 pixel = texture(u_frame, displaced_uv);
  vec3 dark_edge = mix(pixel.rgb, vec3(0.12, 0.09, 0.15), crack_mask * 0.72 * strength);
  float glint = smoothstep(0.018, 0.006, abs(v_uv.x - 0.52 - sin(v_uv.y * 17.0 + u_seed) * 0.045));
  vec3 final_rgb = dark_edge + glint * vec3(0.28, 0.24, 0.34) * strength;
  out_color = vec4(final_rgb, strength);
}`;

function compileShader(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader | null {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function validatedSize(rect: Rect) {
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (width * height > MAX_CAPTURE_PIXELS) return null;
  return { width, height };
}

function asWritableBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function captureWithDeadline(plan: EpisodePlan, rect: Rect) {
  return new Promise<ArrayBuffer | Uint8Array | null>((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      settled = true;
      resolve(null);
    }, CAPTURE_TIMEOUT_MS);
    void desktopBridge.captureRegion({ monitorId: plan.monitorId, x: rect.x, y: rect.y, width: rect.width, height: rect.height }).then((binary) => {
      if (settled) {
        if (binary) asWritableBytes(binary).fill(0);
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      resolve(binary);
    });
  });
}

interface ImmersiveCanvasProps {
  plan: EpisodePlan;
  onReady: () => void;
  onFallback: () => void;
}

export function ImmersiveCanvas({ plan, onReady, onFallback }: ImmersiveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rect = plan.captureRect;
    const size = rect ? validatedSize(rect) : null;
    if (!canvas || !rect || !size) {
      onFallback();
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let gl: WebGL2RenderingContext | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let vertexArray: WebGLVertexArrayObject | null = null;
    let program: WebGLProgram | null = null;

    const releaseGpu = () => {
      if (!gl || gl.isContextLost()) return;
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (vertexArray) gl.deleteVertexArray(vertexArray);
      if (program) gl.deleteProgram(program);
      texture = null;
      buffer = null;
      vertexArray = null;
      program = null;
    };

    const contextLost = (event: Event) => {
      event.preventDefault();
      if (!disposed) onFallback();
    };
    canvas.addEventListener("webglcontextlost", contextLost);

    void captureWithDeadline(plan, rect).then((binary) => {
      if (disposed || !binary) {
        if (!disposed) onFallback();
        return;
      }

      const bytes = asWritableBytes(binary);
      if (bytes.byteLength !== size.width * size.height * 4) {
        bytes.fill(0);
        onFallback();
        return;
      }

      canvas.width = size.width;
      canvas.height = size.height;
      gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        depth: false,
        desynchronized: true,
        preserveDrawingBuffer: false,
        premultipliedAlpha: true,
      });
      if (!gl) {
        bytes.fill(0);
        onFallback();
        return;
      }

      const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!vertexShader || !fragmentShader) {
        if (vertexShader) gl.deleteShader(vertexShader);
        if (fragmentShader) gl.deleteShader(fragmentShader);
        bytes.fill(0);
        onFallback();
        return;
      }

      program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        bytes.fill(0);
        onFallback();
        return;
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        bytes.fill(0);
        releaseGpu();
        onFallback();
        return;
      }

      vertexArray = gl.createVertexArray();
      buffer = gl.createBuffer();
      texture = gl.createTexture();
      if (!vertexArray || !buffer || !texture) {
        bytes.fill(0);
        releaseGpu();
        onFallback();
        return;
      }

      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.width, size.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      bytes.fill(0);

      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, "u_frame"), 0);
      gl.uniform1f(gl.getUniformLocation(program, "u_seed"), plan.seed % 997);
      gl.viewport(0, 0, size.width, size.height);
      gl.clearColor(0, 0, 0, 0);
      onReady();

      const startedAt = performance.now();
      const draw = (now: number) => {
        if (disposed || !gl || !program || gl.isContextLost()) return;
        const progress = Math.min(1, (now - startedAt) / EFFECT_DURATION_MS);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(gl.getUniformLocation(program, "u_time"), progress);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (progress < 1) animationFrame = requestAnimationFrame(draw);
        else releaseGpu();
      };
      animationFrame = requestAnimationFrame(draw);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      releaseGpu();
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.width = 1;
      canvas.height = 1;
    };
  }, [onFallback, onReady, plan]);

  return <canvas ref={canvasRef} className="immersive-canvas" aria-hidden="true" />;
}
