// Gera o logo da CallVortex (quadrado arredondado com gradiente + redemoinho
// branco) e grava build/icon.png (512) e build/icon-256.png (256).
// Sem dependências: usa apenas zlib/fs do Node para codificar o PNG.
//
// Uso: node scripts/generate-logo.js
// Também imprime o path do redemoinho em SVG (para o componente Logo.tsx).

const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

// ------------------------------------------------------------
// Encoder PNG mínimo (RGBA 8-bit)
// ------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filtro "None"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ------------------------------------------------------------
// Desenho do logo
// ------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Cores do gradiente (blurple da marca)
const TOP = [0x6e, 0x7c, 0xff]
const BOTTOM = [0x46, 0x52, 0xd8]

// Geometria (proporcional a um canvas 512)
const MARGIN = 24
const CORNER = 112
const R_MIN = 20
const R_MAX = 200
const TURNS = 1.6
const B = (R_MAX - R_MIN) / (2 * Math.PI * TURNS)
const HALF_W = 6.5
const DOT_R = 24

function render(size) {
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const scale = size / 512
  const margin = MARGIN * scale
  const corner = CORNER * scale
  const half = size / 2 - margin
  const rmin = R_MIN * scale
  const b = B * scale
  const halfW = HALF_W * scale
  const dotR = DOT_R * scale
  const rmax = R_MAX * scale

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // distância ao quadrado arredondado
      const qx = Math.abs(x - cx) - (half - corner)
      const qy = Math.abs(y - cx) - (half - corner)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const d = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - corner
      const bgCov = clamp01(0.5 - d)
      if (bgCov <= 0) continue

      // fundo: gradiente vertical
      const t = y / size
      const bg = [TOP[0] + (BOTTOM[0] - TOP[0]) * t, TOP[1] + (BOTTOM[1] - TOP[1]) * t, TOP[2] + (BOTTOM[2] - TOP[2]) * t]

      const dx = x - cx
      const dy = y - cx
      const r = Math.hypot(dx, dy)

      let cov = 0
      if (r < dotR + 1) {
        // núcleo do redemoinho
        cov = clamp01(0.5 + (dotR - r))
      } else if (r < rmax + halfW + 2) {
        // espiral: distância radial à volta mais próxima
        const theta = Math.atan2(dy, dx)
        const th = theta < 0 ? theta + 2 * Math.PI : theta
        let best = Infinity
        for (let k = 0; k < 8; k++) {
          const rt = rmin + b * (th + 2 * Math.PI * k)
          if (rt > rmax) break
          best = Math.min(best, Math.abs(r - rt))
        }
        cov = clamp01(0.5 + (halfW - best) / 1.5)
      }

      const idx = (y * size + x) * 4
      buf[idx] = Math.round(bg[0] + (255 - bg[0]) * cov)
      buf[idx + 1] = Math.round(bg[1] + (255 - bg[1]) * cov)
      buf[idx + 2] = Math.round(bg[2] + (255 - bg[2]) * cov)
      buf[idx + 3] = Math.round(bgCov * 255)
    }
  }
  return buf
}

const outDir = path.join(__dirname, '..', 'build')
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePNG(512, 512, render(512)))
fs.writeFileSync(path.join(outDir, 'icon-256.png'), encodePNG(256, 256, render(256)))
console.log('Gerado: build/icon.png (512x512) e build/icon-256.png (256x256)')

// ------------------------------------------------------------
// Path SVG do redemoinho (para o componente Logo.tsx)
// ------------------------------------------------------------
const pts = []
const STEPS = 240
for (let i = 0; i <= STEPS; i++) {
  const a = (i / STEPS) * 2 * Math.PI * TURNS
  const r = R_MIN + B * a
  pts.push(`${(256 + r * Math.cos(a)).toFixed(1)} ${(256 + r * Math.sin(a)).toFixed(1)}`)
}
console.log('SVG_SPIRAL_PATH_START')
console.log(`M ${pts.join(' L ')}`)
console.log('SVG_SPIRAL_PATH_END')
