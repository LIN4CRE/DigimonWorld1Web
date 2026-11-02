import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const WORKSPACE = 'C:\\Users\\David\\.gemini\\antigravity\\scratch\\digimon-world-webui';
const PUBLIC_DIR = path.join(WORKSPACE, 'public');
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Minimal PNG Decoder & Encoder (pure Node.js with zlib)
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function decodeOurPNG(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4) + 1;
    raw.copy(rgba, y * width * 4, rowStart, rowStart + width * 4);
  }
  return { width, height, rgba };
}

function blitScaled(dst, dstW, dstH, src, dx, dy, dw, dh, opacity = 1.0) {
  for (let y = 0; y < dh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dstH) continue;
    const sy = Math.min(src.height - 1, Math.floor((y / dh) * src.height));
    for (let x = 0; x < dw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dstW) continue;
      const sx = Math.min(src.width - 1, Math.floor((x / dw) * src.width));
      const sIdx = (sy * src.width + sx) * 4;
      const dIdx = (ty * dstW + tx) * 4;
      const sa = (src.rgba[sIdx + 3] / 255) * opacity;
      if (sa <= 0) continue;
      const inv = 1 - sa;
      dst[dIdx]     = Math.round(src.rgba[sIdx] * sa + dst[dIdx] * inv);
      dst[dIdx + 1] = Math.round(src.rgba[sIdx + 1] * sa + dst[dIdx + 1] * inv);
      dst[dIdx + 2] = Math.round(src.rgba[sIdx + 2] * sa + dst[dIdx + 2] * inv);
      dst[dIdx + 3] = 255;
    }
  }
}

function drawRectBorder(dst, dstW, dstH, rx, ry, rw, rh, thickness, r, g, b) {
  for (let y = ry; y < ry + rh; y++) {
    if (y < 0 || y >= dstH) continue;
    for (let x = rx; x < rx + rw; x++) {
      if (x < 0 || x >= dstW) continue;
      if (x < rx + thickness || x >= rx + rw - thickness || y < ry + thickness || y >= ry + rh - thickness) {
        const idx = (y * dstW + x) * 4;
        dst[idx] = r;
        dst[idx + 1] = g;
        dst[idx + 2] = b;
        dst[idx + 3] = 255;
      }
    }
  }
}

// ============================================================================
// 1. GENERATE 1280x640 SOCIAL PREVIEW PNG (public/assets/social-preview.png)
// ============================================================================
const W = 1280;
const H = 640;
const socialRgba = Buffer.alloc(W * H * 4);

const mapBg = decodeOurPNG(path.join(PUBLIC_DIR, 'maps', 'file_city.png'));
const titleImg = decodeOurPNG(path.join(PUBLIC_DIR, 'textures', 'TITLE256.png'));
const cards = [
  decodeOurPNG(path.join(PUBLIC_DIR, 'cards', 'card_00.png')), // Agumon
  decodeOurPNG(path.join(PUBLIC_DIR, 'cards', 'card_02.png')), // Greymon
  decodeOurPNG(path.join(PUBLIC_DIR, 'cards', 'card_09.png')), // MetalGreymon
  decodeOurPNG(path.join(PUBLIC_DIR, 'cards', 'card_23.png')), // SkullGreymon
  decodeOurPNG(path.join(PUBLIC_DIR, 'cards', 'card_51.png'))  // Megadramon
];

// Background: File City pre-rendered 3D map with dark cyber vignette
blitScaled(socialRgba, W, H, mapBg, 0, 0, W, H, 1.0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    // Darken & add deep navy-cyan gradient
    socialRgba[idx]     = Math.round(socialRgba[idx] * 0.32 + 6);
    socialRgba[idx + 1] = Math.round(socialRgba[idx + 1] * 0.36 + 14);
    socialRgba[idx + 2] = Math.round(socialRgba[idx + 2] * 0.42 + 32);
    socialRgba[idx + 3] = 255;
  }
}

// Outer golden & cyan frame
drawRectBorder(socialRgba, W, H, 12, 12, W - 24, H - 24, 4, 245, 158, 11);
drawRectBorder(socialRgba, W, H, 20, 20, W - 40, H - 40, 2, 6, 182, 212);

// Blit Title Screen Artwork on Left
blitScaled(socialRgba, W, H, titleImg, 56, 64, 480, 340, 1.0);
drawRectBorder(socialRgba, W, H, 52, 60, 488, 348, 4, 245, 158, 11);

// Blit 5 HD 3D Digimon Cards on Right
cards.forEach((cImg, idx) => {
  const cx = 575 + idx * 132;
  const cy = 110 + (idx % 2) * 36;
  blitScaled(socialRgba, W, H, cImg, cx, cy, 120, 144, 1.0);
  drawRectBorder(socialRgba, W, H, cx - 3, cy - 3, 126, 150, 3, idx === 2 ? 245 : 6, idx === 2 ? 158 : 182, idx === 2 ? 11 : 212);
});

const socialPng = encodePNG(W, H, socialRgba);
fs.writeFileSync(path.join(ASSETS_DIR, 'social-preview.png'), socialPng);
console.log('✓ Generated public/assets/social-preview.png (1280×640)');

// ============================================================================
// 2. GENERATE HIGH-RES GITHUB HERO BANNER SVG (public/assets/github-banner.svg)
// ============================================================================
const b64Title = fs.readFileSync(path.join(PUBLIC_DIR, 'textures', 'TITLE256.png')).toString('base64');
const b64Map = fs.readFileSync(path.join(PUBLIC_DIR, 'maps', 'file_city.png')).toString('base64');
const b64Card0 = fs.readFileSync(path.join(PUBLIC_DIR, 'cards', 'card_00.png')).toString('base64');
const b64Card2 = fs.readFileSync(path.join(PUBLIC_DIR, 'cards', 'card_02.png')).toString('base64');
const b64Card9 = fs.readFileSync(path.join(PUBLIC_DIR, 'cards', 'card_09.png')).toString('base64');
const b64Card23 = fs.readFileSync(path.join(PUBLIC_DIR, 'cards', 'card_23.png')).toString('base64');
const b64Card51 = fs.readFileSync(path.join(PUBLIC_DIR, 'cards', 'card_51.png')).toString('base64');

const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 420" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#040814" stop-opacity="0.92"/>
      <stop offset="50%" stop-color="#0a152e" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#050b18" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="55%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="50%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <pattern id="cyberGrid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(56, 189, 248, 0.08)" stroke-width="1"/>
    </pattern>
    <clipPath id="bannerClip">
      <rect x="0" y="0" width="1280" height="420" rx="18"/>
    </clipPath>
    <clipPath id="titleClip">
      <rect x="38" y="42" width="340" height="255" rx="12"/>
    </clipPath>
  </defs>

  <g clip-path="url(#bannerClip)">
    <!-- Decoded Pre-Rendered 3D File City Background (VILL01.TFS) -->
    <image href="data:image/png;base64,${b64Map}" x="0" y="-120" width="1280" height="720" preserveAspectRatio="xMidYMid slice" opacity="0.48"/>
    <rect x="0" y="0" width="1280" height="420" fill="url(#bgGrad)"/>
    <rect x="0" y="0" width="1280" height="420" fill="url(#cyberGrid)"/>

    <!-- Outer Neon Frame -->
    <rect x="3" y="3" width="1274" height="414" rx="16" fill="none" stroke="url(#goldBorder)" stroke-width="3"/>

    <!-- Authentic PS1 Title Screen TIM Artwork -->
    <g clip-path="url(#titleClip)">
      <image href="data:image/png;base64,${b64Title}" x="38" y="42" width="340" height="255" preserveAspectRatio="xMidYMid slice"/>
    </g>
    <rect x="38" y="42" width="340" height="255" rx="12" fill="none" stroke="#f59e0b" stroke-width="2.5"/>

    <!-- Center Typography & Badges -->
    <g transform="translate(405, 68)">
      <rect x="0" y="0" width="290" height="26" rx="13" fill="rgba(245, 158, 11, 0.16)" stroke="#f59e0b" stroke-width="1.2"/>
      <text x="145" y="17" fill="#fbbf24" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle">PLAYSTATION 1 • SLES-02914 • PAL EUROPE</text>

      <text x="0" y="68" fill="url(#titleGrad)" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="42" font-weight="900" letter-spacing="0.5">DIGIMON WORLD 1</text>
      <text x="0" y="102" fill="#f8fafc" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="21" font-weight="700" letter-spacing="1.2">HD WEB EDITION &amp; 127-DIGIMON ROM PATCH</text>

      <text x="0" y="138" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14.5">
        Play the real 3D PS1 classic directly in your browser in 2x Neon HD — binary-patched
      </text>
      <text x="0" y="160" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14.5">
        to unlock all 66 Overworld, Boss &amp; Cut Ultimate Digimon (#62–#127) as playable partners.
      </text>

      <!-- Feature Pills -->
      <g transform="translate(0, 186)">
        <rect x="0" y="0" width="172" height="30" rx="8" fill="#131d36" stroke="#22d3ee" stroke-width="1.2"/>
        <text x="86" y="19" fill="#22d3ee" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle">✨ 2X NEON HD 3D</text>

        <rect x="182" y="0" width="196" height="30" rx="8" fill="#131d36" stroke="#34d399" stroke-width="1.2"/>
        <text x="280" y="19" fill="#34d399" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle">🦖 127 DIGIMON PLAYABLE</text>

        <rect x="388" y="0" width="186" height="30" rx="8" fill="#131d36" stroke="#c084fc" stroke-width="1.2"/>
        <text x="481" y="19" fill="#c084fc" font-family="monospace" font-size="12" font-weight="bold" text-anchor="middle">🔬 REA v6.7.0 VERIFIED</text>
      </g>
    </g>

    <!-- Bottom Status Strip -->
    <rect x="38" y="322" width="1204" height="64" rx="10" fill="rgba(10, 16, 32, 0.88)" stroke="#24355e" stroke-width="1.5"/>
    <text x="60" y="349" fill="#fbbf24" font-family="monospace" font-size="13" font-weight="bold">UNLOCKED OVERWORLD &amp; CUT ROSTER:</text>
    <text x="60" y="371" fill="#e2e8f0" font-family="monospace" font-size="12">
      Machinedramon • Myotismon • Panjyamon • Gigadramon • MetalEtemon • WereGarurumon • Tankmon • Guardromon • Tentomon • WaruMonzaemon • BlueMeramon • IceDevimon + 54 more
    </text>

    <!-- 3D Rendered Bandai Card Showcase on Right -->
    <g transform="translate(995, 36)">
      <g transform="translate(0, 18) rotate(-6)">
        <rect x="-3" y="-3" width="110" height="132" rx="8" fill="#091020" stroke="#38bdf8" stroke-width="2"/>
        <image href="data:image/png;base64,${b64Card0}" x="0" y="0" width="104" height="126"/>
      </g>
      <g transform="translate(72, 6) rotate(2)">
        <rect x="-3" y="-3" width="116" height="140" rx="8" fill="#091020" stroke="#fbbf24" stroke-width="2.5"/>
        <image href="data:image/png;base64,${b64Card9}" x="0" y="0" width="110" height="134"/>
      </g>
      <g transform="translate(142, 26) rotate(9)">
        <rect x="-3" y="-3" width="110" height="132" rx="8" fill="#091020" stroke="#ef4444" stroke-width="2"/>
        <image href="data:image/png;base64,${b64Card51}" x="0" y="0" width="104" height="126"/>
      </g>
      <g transform="translate(26, 134) rotate(-3)">
        <rect x="-3" y="-3" width="106" height="128" rx="8" fill="#091020" stroke="#34d399" stroke-width="2"/>
        <image href="data:image/png;base64,${b64Card2}" x="0" y="0" width="100" height="122"/>
      </g>
      <g transform="translate(116, 138) rotate(5)">
        <rect x="-3" y="-3" width="106" height="128" rx="8" fill="#091020" stroke="#c084fc" stroke-width="2"/>
        <image href="data:image/png;base64,${b64Card23}" x="0" y="0" width="100" height="122"/>
      </g>
    </g>
  </g>
</svg>`;

fs.writeFileSync(path.join(ASSETS_DIR, 'github-banner.svg'), bannerSvg);
console.log('✓ Generated public/assets/github-banner.svg (1280×420 Vector + Embedded HD Assets)');

// ============================================================================
// 3. GENERATE FAVICONS & PWA APP ICONS (favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, favicon.ico)
// ============================================================================
function makeAppIconPNG(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cardAgumon = cards[0]; // Agumon 3D HD Card
  // Fill dark cyber rounded square background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      rgba[idx] = 10;
      rgba[idx + 1] = 16;
      rgba[idx + 2] = 34;
      rgba[idx + 3] = 255;
    }
  }
  const pad = Math.round(size * 0.06);
  blitScaled(rgba, size, size, cardAgumon, pad, pad, size - pad * 2, size - pad * 2, 1.0);
  drawRectBorder(rgba, size, size, 0, 0, size, size, Math.max(2, Math.round(size * 0.04)), 245, 158, 11);
  return encodePNG(size, size, rgba);
}

fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), makeAppIconPNG(192));
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), makeAppIconPNG(512));
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), makeAppIconPNG(180));

// Build valid ICO file wrapping a 64x64 PNG
const icon64Png = makeAppIconPNG(64);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);      // Reserved
icoHeader.writeUInt16LE(1, 2);      // Type 1 = ICO
icoHeader.writeUInt16LE(1, 4);      // 1 image
icoHeader[6] = 64;                  // Width 64
icoHeader[7] = 64;                  // Height 64
icoHeader[8] = 0;                   // Color palette
icoHeader[9] = 0;                   // Reserved
icoHeader.writeUInt16LE(1, 10);     // Color planes
icoHeader.writeUInt16LE(32, 12);    // 32 bpp
icoHeader.writeUInt32LE(icon64Png.length, 14); // Size of PNG data
icoHeader.writeUInt32LE(22, 18);    // Offset of PNG data
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), Buffer.concat([icoHeader, icon64Png]));

// Vector V-Pet Brick / Digivice SVG Favicon
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" rx="14" fill="#0b1329" stroke="#f59e0b" stroke-width="4"/>
  <rect x="10" y="10" width="44" height="44" rx="8" fill="#132247" stroke="#38bdf8" stroke-width="2"/>
  <image href="data:image/png;base64,${b64Card0}" x="12" y="12" width="40" height="40" preserveAspectRatio="xMidYMid slice"/>
</svg>`;
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), faviconSvg);

// Web App Manifest
const manifest = {
  name: 'Digimon World 1 — HD Unlocked Web Edition',
  short_name: 'DigimonWorld1',
  description: 'PlayStation 1 Digimon World (Europe SLES-02914) in 2x Neon HD with all 127 Digimon unlocked as playable partners.',
  start_url: '/',
  display: 'standalone',
  background_color: '#04070f',
  theme_color: '#f59e0b',
  icons: [
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
  ]
};
fs.writeFileSync(path.join(PUBLIC_DIR, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
console.log('✓ Generated favicons (favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png) & manifest.webmanifest');
