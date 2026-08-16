#!/usr/bin/env node
/**
 * Gera o ícone do app (build/icon.png) sem dependências externas.
 * Uso: node scripts/generate-icon.js
 * Desenha o design (quadrado arredondado blurple + balão de chat branco)
 * pixel a pixel, com anti-aliasing por supersampling, e escreve PNG (512 + 256).
 * Funciona em qualquer sistema (Windows, Linux, macOS).
 */
const { deflateSync } = require('zlib')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const S = 512
const SS = 3 // supersampling (3x3 subpixels por pixel)

// paleta
const cTop = [125, 141, 232] // #7d8de8
const cBottom = [63, 72, 168] // #3f48a8
const cDot = [88, 101, 242] // #5865f2
const WHITE = [255, 255, 255]

// geometria (coordenadas do canvas 512)
const ICON = { cx: 256, cy: 256, hw: 256, hh: 256, r: 112 }
const BUBBLE = { cx: 256, cy: 209, hw: 130, hh: 75, r: 30 }
const TAIL = [
  [246, 284],
  [206, 318],
  [210, 284]
]
const DOTS = [
  [211, 209],
  [256, 209],
  [301, 209]
]
const DOT_R = 21

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function inTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
  const d1 = sign([px, py], a, b)
  const d2 = sign([px, py], b, c)
  const d3 = sign([px, py], c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

function sampleColor(x, y) {
  const inBubble = sdRoundRect(x, y, BUBBLE.cx, BUBBLE.cy, BUBBLE.hw, BUBBLE.hh, BUBBLE.r) <= 0 || inTriangle(x, y, TAIL[0], TAIL[1], TAIL[2])
  if (inBubble) {
    for (const [dx, dy] of DOTS) {
      if (Math.hypot(x - dx, y - dy) <= DOT_R) return { c: cDot, a: 1 }
    }
    return { c: WHITE, a: 1 }
  }
  if (sdRoundRect(x, y, ICON.cx, ICON.cy, ICON.hw, ICON.hh, ICON.r) <= 0) {
    const t = (x + y) / (2 * S)
    const c = cTop.map((v, i) => Math.round(v + (cBottom[i] - v) * t))
    return { c, a: 1 }
  }
  return { c: [0, 0, 0], a: 0 }
}

function render(size) {
  const scale = size / S
  const buf = Buffer.alloc(size * size * 4)
  const step = 1 / SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) * step) * scale
          const py = (y + (sy + 0.5) * step) * scale
          const s = sampleColor(px, py)
          r += s.c[0] * s.a
          g += s.c[1] * s.a
          b += s.c[2] * s.a
          a += s.a
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      buf[o] = Math.round(r / n)
      buf[o + 1] = Math.round(g / n)
      buf[o + 2] = Math.round(b / n)
      buf[o + 3] = Math.round((a / n) * 255)
    }
  }
  return buf
}

// ---------- PNG encoder (RGBA, 8 bits) ----------
const crcTable = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePNG(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const dir = join(__dirname, '..', 'build')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'icon.png'), encodePNG(S, S, render(S)))
writeFileSync(join(dir, 'icon-256.png'), encodePNG(256, 256, render(256)))
console.log('Ícone gerado: build/icon.png (512x512) + build/icon-256.png (256x256)')
