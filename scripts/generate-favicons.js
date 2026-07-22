import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, "../public")

/**
 * Pure Node.js PNG encoder. Generates 32-bit RGBA PNG buffers without external dependencies.
 */
function createPng(width, height, getPixel) {
  const rawData = Buffer.alloc(height * (1 + width * 4))
  let offset = 0
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0 // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y)
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(r)))
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(g)))
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(b)))
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(a)))
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 })

  function crc32(buf) {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
      }
    }
    return (c ^ 0xffffffff) >>> 0
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, "ascii")
    const body = Buffer.concat([typeBuf, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([len, body, crc])
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA color type
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = makeChunk("IHDR", header)
  const idat = makeChunk("IDAT", compressed)
  const iend = makeChunk("IEND", Buffer.alloc(0))

  return Buffer.concat([sig, ihdr, idat, iend])
}

/** Point in polygon test */
function pointInPoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Distance to polygon boundary for smooth anti-aliasing */
function distToPoly(px, py, poly) {
  let minD = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[i][0], ay = poly[i][1]
    const bx = poly[j][0], by = poly[j][1]
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2
    let t = l2 === 0 ? 0 : ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2
    t = Math.max(0, Math.min(1, t))
    const projX = ax + t * (bx - ax)
    const projY = ay + t * (by - ay)
    const d = Math.hypot(px - projX, py - projY)
    if (d < minD) minD = d
  }
  return minD
}

const V_LEFT_STEM = [
  [0.14, 0.20],
  [0.34, 0.20],
  [0.54, 0.80],
  [0.34, 0.80],
]

const V_RIGHT_WING = [
  [0.40, 0.52],
  [0.64, 0.20],
  [0.86, 0.20],
  [0.58, 0.72],
]

function renderRefinedVaporFaviconPixel(x, y, size) {
  const u = (x + 0.5) / size
  const v = (y + 0.5) / size

  const radius = 0.22
  const margin = 0.02
  const cx = Math.max(0, Math.abs(u - 0.5) - (0.5 - margin - radius))
  const cy = Math.max(0, Math.abs(v - 0.5) - (0.5 - margin - radius))
  const outsideContainer = cx > 0 && cy > 0 && Math.hypot(cx, cy) > radius

  if (outsideContainer) {
    return [0, 0, 0, 0]
  }

  let bgR = 8, bgG = 9, bgB = 11, bgA = 255
  const px = x + 0.5
  const py = y + 0.5

  const dotX = 0.80, dotY = 0.74, dotR = 0.075
  const distToDot = Math.hypot(u - dotX, v - dotY)
  if (distToDot <= dotR + 0.03) {
    const dotAlpha = distToDot <= dotR - 0.01 ? 1 : Math.max(0, 1 - (distToDot - (dotR - 0.01)) / 0.04)
    if (dotAlpha > 0) {
      const r = 169 * dotAlpha + bgR * (1 - dotAlpha)
      const g = 232 * dotAlpha + bgG * (1 - dotAlpha)
      const b = 220 * dotAlpha + bgB * (1 - dotAlpha)
      return [r, g, b, 255]
    }
  }

  const polyLeft = V_LEFT_STEM.map(([nx, ny]) => [nx * size, ny * size])
  const inLeft = pointInPoly(px, py, polyLeft)
  const dLeft = distToPoly(px, py, polyLeft)
  let alphaLeft = inLeft ? (dLeft >= 0.75 ? 1 : 0.5 + dLeft / 1.5) : (dLeft <= 0.75 ? 0.5 - dLeft / 1.5 : 0)
  alphaLeft = Math.max(0, Math.min(1, alphaLeft))

  if (alphaLeft > 0) {
    const r = 244 * alphaLeft + bgR * (1 - alphaLeft)
    const g = 244 * alphaLeft + bgG * (1 - alphaLeft)
    const b = 245 * alphaLeft + bgB * (1 - alphaLeft)
    return [r, g, b, 255]
  }

  const polyRight = V_RIGHT_WING.map(([nx, ny]) => [nx * size, ny * size])
  const inRight = pointInPoly(px, py, polyRight)
  const dRight = distToPoly(px, py, polyRight)
  let alphaRight = inRight ? (dRight >= 0.75 ? 1 : 0.5 + dRight / 1.5) : (dRight <= 0.75 ? 0.5 - dRight / 1.5 : 0)
  alphaRight = Math.max(0, Math.min(1, alphaRight))

  if (alphaRight > 0) {
    const k = (v - 0.20) / 0.52
    const fgR = 169 + (71 - 169) * k
    const fgG = 232 + (191 - 232) * k
    const fgB = 220 + (255 - 220) * k

    const r = fgR * alphaRight + bgR * (1 - alphaRight)
    const g = fgG * alphaRight + bgG * (1 - alphaRight)
    const b = fgB * alphaRight + bgB * (1 - alphaRight)
    return [r, g, b, 255]
  }

  return [bgR, bgG, bgB, bgA]
}

function generateRefinedFavicons() {
  console.log("Generating streamlined Vapor favicon assets...")

  const png16 = createPng(16, 16, (x, y) => renderRefinedVaporFaviconPixel(x, y, 16))
  const png32 = createPng(32, 32, (x, y) => renderRefinedVaporFaviconPixel(x, y, 32))

  // 1. apple-touch-icon.png (180x180)
  const png180 = createPng(180, 180, (x, y) => renderRefinedVaporFaviconPixel(x, y, 180))
  fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), png180)

  // 2. android-chrome-192x192.png
  const png192 = createPng(192, 192, (x, y) => renderRefinedVaporFaviconPixel(x, y, 192))
  fs.writeFileSync(path.join(publicDir, "android-chrome-192x192.png"), png192)

  // 3. android-chrome-512x512.png
  const png512 = createPng(512, 512, (x, y) => renderRefinedVaporFaviconPixel(x, y, 512))
  fs.writeFileSync(path.join(publicDir, "android-chrome-512x512.png"), png512)

  // 4. favicon.ico (Combines 16x16 & 32x32 frames natively)
  function createIco(pngBuffers) {
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(pngBuffers.length, 4)

    let offset = 6 + pngBuffers.length * 16
    const entries = []
    for (const { width, height, buf } of pngBuffers) {
      const entry = Buffer.alloc(16)
      entry[0] = width >= 256 ? 0 : width
      entry[1] = height >= 256 ? 0 : height
      entry[2] = 0
      entry[3] = 0
      entry.writeUInt16LE(1, 4)
      entry.writeUInt16LE(32, 6)
      entry.writeUInt32LE(buf.length, 8)
      entry.writeUInt32LE(offset, 12)
      offset += buf.length
      entries.push(entry)
    }

    return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buf)])
  }

  const icoBuf = createIco([
    { width: 16, height: 16, buf: png16 },
    { width: 32, height: 32, buf: png32 },
  ])
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuf)

  // 5. favicon.svg
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="7" fill="#08090b"/>
  <defs>
    <linearGradient id="vapor-wing-grad" x1="16" y1="6" x2="28" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#a9e8dc" />
      <stop offset="100%" stop-color="#47bfff" />
    </linearGradient>
  </defs>
  <path fill="#f4f4f5" d="M4.48 6.4h6.4l6.4 19.2h-6.4L4.48 6.4z"/>
  <path fill="url(#vapor-wing-grad)" d="M12.8 16.64L20.48 6.4h7.04l-8.96 16.64-5.76-6.4z"/>
  <circle cx="25.6" cy="23.68" r="2.4" fill="#a9e8dc"/>
</svg>
`
  fs.writeFileSync(path.join(publicDir, "favicon.svg"), svgContent)

  console.log("Successfully generated clean production Vapor favicon set!")
}

generateRefinedFavicons()
