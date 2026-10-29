#!/usr/bin/env node
/*
 * Builds release packages for both browsers from the one codebase:
 *   dist/unsigned-chrome-<version>.zip   (Chrome, Brave, Edge — also what the Chrome Web Store takes)
 *   dist/unsigned-firefox-<version>.zip  (Firefox — what addons.mozilla.org takes)
 *
 * The repo root is the Chrome build as-is (Load unpacked works on it directly).
 * Firefox gets the same files with platform/firefox.json merged over the manifest.
 *
 * No dependencies: `node build.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');

// Everything that ships inside the extension. Manifest is added separately per browser.
const INCLUDE = ['background.js', 'LICENSE', 'src', 'popup', 'icons'];

function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).sort().flatMap((name) => walk(path.posix.join(rel, name)));
}

// Merge `overlay` into `base`; a null value deletes the key.
function merge(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) delete out[key];
    else if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = merge(out[key], value);
    } else out[key] = value;
  }
  return out;
}

// ── Minimal zip writer (deflate, no external tools) ─────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(entries) {
  // Fixed timestamp so rebuilding the same source gives the same bytes.
  const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);                 // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ── Build ───────────────────────────────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const files = INCLUDE.flatMap(walk).map((name) => ({ name, data: fs.readFileSync(path.join(ROOT, name)) }));

const targets = {
  chrome: manifest,
  firefox: merge(manifest, JSON.parse(fs.readFileSync(path.join(ROOT, 'platform', 'firefox.json'), 'utf8')))
};

fs.mkdirSync(DIST, { recursive: true });
for (const [browser, m] of Object.entries(targets)) {
  const entries = [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(m, null, 2) + '\n') }, ...files];
  const out = path.join(DIST, `unsigned-${browser}-${manifest.version}.zip`);
  fs.writeFileSync(out, zip(entries));

  // Also leave an unpacked copy for local testing (Firefox: about:debugging → Load Temporary Add-on).
  const dir = path.join(DIST, browser);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const { name, data } of entries) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), data);
  }
  console.log(`${path.relative(ROOT, out)}  (${entries.length} files)`);
}
