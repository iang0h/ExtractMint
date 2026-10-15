import { useEffect, useRef } from 'react'
import './TopoFieldBackdrop.css'

const vertexSource = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Adapted from the ThreeUI Community TopoField shader; see THIRD_PARTY_NOTICES.md.
const fragmentSource = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dpr;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  st.x *= u_resolution.x / u_resolution.y;

  float gridSize = 48.0 * u_dpr;
  vec2 gridSt = gl_FragCoord.xy / gridSize;
  vec2 gridFract = fract(gridSt);
  float lineThickness = 1.0 / gridSize;
  float gridLines = step(1.0 - lineThickness, gridFract.x) + step(1.0 - lineThickness, gridFract.y);
  gridLines = clamp(gridLines, 0.0, 1.0) * 0.12;

  float noiseScale = 1.4;
  vec2 noisePos = st * noiseScale + vec2(u_time * 0.015, u_time * 0.025);
  float n = snoise(noisePos) * 0.5 + 0.5;
  float numBands = 10.0;
  float bandVal = n * numBands;
  float triangleWave = abs(fract(bandVal) - 0.5) * 2.0;
  float topoLines = smoothstep(0.02, 0.00, triangleWave) * 0.45;

  vec3 ink = vec3(0.063, 0.125, 0.161);
  vec3 mint = vec3(0.071, 0.725, 0.506);
  float alpha = clamp(gridLines * 0.5 + topoLines * 0.8, 0.0, 1.0);
  vec3 color = mix(ink, mint, topoLines / max(gridLines + topoLines, 0.001));
  gl_FragColor = vec4(color, alpha);
}
`

export function TopoFieldBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
    })
    if (!gl) return

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
      gl.deleteShader(shader)
      return null
    }

    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource)
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      return
    }

    const program = gl.createProgram()
    if (!program) {
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }

    const buffer = gl.createBuffer()
    if (!buffer) {
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      return
    }

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'u_resolution')
    const time = gl.getUniformLocation(program, 'u_time')
    const dprUniform = gl.getUniformLocation(program, 'u_dpr')

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = typeof IntersectionObserver === 'undefined'
    let contextLost = false
    let frame = 0
    let elapsed = 0
    let lastFrameTime: number | null = null

    const draw = () => {
      if (contextLost || canvas.width === 0 || canvas.height === 0) return
      gl.uniform1f(time, elapsed)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    const resize = () => {
      if (contextLost) return
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(0, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(0, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
      gl.uniform2f(resolution, width, height)
      gl.uniform1f(dprUniform, dpr)
      draw()
    }

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      lastFrameTime = null
    }

    const tick = (now: number) => {
      frame = 0
      if (lastFrameTime !== null) elapsed += (now - lastFrameTime) * 0.001
      lastFrameTime = now
      draw()
      frame = window.requestAnimationFrame(tick)
    }

    const sync = () => {
      if (contextLost || !visible || document.hidden || motion.matches) {
        stop()
        if (motion.matches) draw()
      } else if (!frame) {
        frame = window.requestAnimationFrame(tick)
      }
    }

    const onContextLost = () => {
      contextLost = true
      stop()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    window.addEventListener('resize', resize)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    resizeObserver?.observe(canvas)
    const intersectionObserver = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting
        sync()
      })
    intersectionObserver?.observe(canvas.parentElement ?? canvas)
    resize()
    sync()

    return () => {
      stop()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      intersectionObserver?.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      if (!gl.isContextLost()) {
        gl.deleteBuffer(buffer)
        gl.deleteProgram(program)
        gl.deleteShader(vertexShader)
        gl.deleteShader(fragmentShader)
      }
    }
  }, [])

  return (
    <div className="topo-field-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
