import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createAppServer, parseRange, PUBLIC_DIR } from '../server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let server;
let port;

before(async () => {
  server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

// Send a raw request path verbatim (http.request does not normalize the `path`
// option), which is required to exercise traversal and malformed-range cases.
function req(rawPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: '127.0.0.1', port, path: rawPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    r.on('error', reject);
    r.end();
  });
}

test('parseRange handles valid, suffix, open-ended, unsatisfiable and malformed ranges', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 });
  assert.deepEqual(parseRange('bytes=0-0', 1000), { start: 0, end: 0 });
  // end beyond EOF is clamped
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
  // unsatisfiable -> false (416)
  assert.equal(parseRange('bytes=1000-', 1000), false);
  assert.equal(parseRange('bytes=500-100', 1000), false);
  assert.equal(parseRange('bytes=-0', 1000), false);
  assert.equal(parseRange('bytes=0-10', 0), false);
  // malformed / unsupported -> null (ignore, serve full 200)
  assert.equal(parseRange('bytes=abc', 1000), null);
  assert.equal(parseRange('bytes=-', 1000), null);
  assert.equal(parseRange('bytes=0-1,2-3', 1000), null);
  assert.equal(parseRange('items=0-10', 1000), null);
  assert.equal(parseRange(undefined, 1000), null);
});

test('GET / serves the index with security headers', async () => {
  const res = await req('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(res.body.toString(), /emulator-boot\.js/);
});

test('directory requests return 404 and never crash the server (P0 EISDIR regression)', async () => {
  for (const dir of ['/maps/', '/rom/', '/bios/', '/cards/', '/data/', '/textures/', '/assets/', '/maps']) {
    const res = await req(dir);
    assert.equal(res.status, 404, `${dir} must be 404, not a crash`);
  }
  // The server must still be alive and serving after all directory probes.
  const alive = await req('/');
  assert.equal(alive.status, 200);
});

test('path traversal is blocked and never leaks files outside public/', async () => {
  const cases = [
    '/../package.json',
    '/%2e%2e/package.json',
    '/%2e%2e/%2e%2e/server.mjs',
    '/..%2fpackage.json',
    '/%2e%2e/public-evil/secret.txt'
  ];
  for (const raw of cases) {
    const res = await req(raw);
    assert.ok([400, 403, 404].includes(res.status), `${raw} -> ${res.status} must be blocked`);
    assert.doesNotMatch(res.body.toString(), /"name":\s*"digimon-world-1-web"/, `${raw} must not leak package.json`);
    assert.doesNotMatch(res.body.toString(), /createAppServer/, `${raw} must not leak server.mjs`);
  }
  const alive = await req('/');
  assert.equal(alive.status, 200);
});

test('valid byte range returns 206 with correct Content-Range and body', async () => {
  const file = path.join(PUBLIC_DIR, 'manifest.webmanifest');
  const size = fs.statSync(file).size;
  const res = await req('/manifest.webmanifest', { headers: { Range: 'bytes=0-9' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers['content-range'], `bytes 0-9/${size}`);
  assert.equal(res.headers['content-length'], '10');
  assert.equal(res.body.length, 10);
  assert.deepEqual(res.body, fs.readFileSync(file).subarray(0, 10));
});

test('suffix and open-ended ranges return 206', async () => {
  const file = path.join(PUBLIC_DIR, 'manifest.webmanifest');
  const bytes = fs.readFileSync(file);
  const size = bytes.length;

  const suffix = await req('/manifest.webmanifest', { headers: { Range: 'bytes=-15' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(suffix.body, bytes.subarray(size - 15));

  const open = await req('/manifest.webmanifest', { headers: { Range: 'bytes=5-' } });
  assert.equal(open.status, 206);
  assert.deepEqual(open.body, bytes.subarray(5));
});

test('unsatisfiable range returns 416 with Content-Range */size', async () => {
  const size = fs.statSync(path.join(PUBLIC_DIR, 'manifest.webmanifest')).size;
  const res = await req('/manifest.webmanifest', { headers: { Range: `bytes=${size + 100}-` } });
  assert.equal(res.status, 416);
  assert.equal(res.headers['content-range'], `bytes */${size}`);
});

test('malformed range is ignored and serves the full file (200)', async () => {
  const res = await req('/manifest.webmanifest', { headers: { Range: 'bytes=abc' } });
  assert.equal(res.status, 200);
  const size = fs.statSync(path.join(PUBLIC_DIR, 'manifest.webmanifest')).size;
  assert.equal(res.body.length, size);
});

test('HEAD returns headers with no body', async () => {
  const res = await req('/manifest.webmanifest', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 0);
  assert.ok(Number(res.headers['content-length']) > 0);
});

test('missing static file returns 404 JSON', async () => {
  const res = await req('/definitely-not-here-12345.png');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /application\/json/);
});

test('malformed URL encoding returns 400 and does not crash', async () => {
  const res = await req('/%zz');
  assert.equal(res.status, 400);
  const alive = await req('/');
  assert.equal(alive.status, 200);
});

test('client abort mid-stream does not crash the server', async () => {
  await new Promise((resolve) => {
    const r = http.request({ hostname: '127.0.0.1', port, path: '/rom/part0.bin', method: 'GET' }, (res) => {
      res.once('data', () => {
        r.destroy();
        resolve();
      });
    });
    r.on('error', () => resolve());
    r.end();
  });
  // Give the server a tick to process the destroyed stream, then confirm health.
  await new Promise((r) => setTimeout(r, 50));
  const alive = await req('/');
  assert.equal(alive.status, 200);
});

test('API /api/disc-files returns the disc index JSON', async () => {
  const res = await req('/api/disc-files');
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body.toString());
  assert.ok(Array.isArray(json.flatFiles));
});

test('API /api/disc-hex reports an honest unavailable state without a ROM', async () => {
  const res = await req('/api/disc-hex?lba=23&size=256');
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body.toString());
  // No ROM is committed, so the endpoint must report ROM_NOT_MOUNTED rather than fake data.
  if (!fs.existsSync(path.join(ROOT, 'rom', 'Digimon World (Europe).bin'))) {
    assert.equal(json.rows[0].ascii, 'ROM_NOT_MOUNTED');
  }
});

test('API /api/disc-hex rejects invalid lba/offset with 400', async () => {
  const res = await req('/api/disc-hex?lba=-5');
  assert.equal(res.status, 400);
  const res2 = await req('/api/disc-hex?offset=-1');
  assert.equal(res2.status, 400);
});

test('API /api/mips-disasm returns a valid fallback without SLES', async () => {
  const res = await req('/api/mips-disasm');
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body.toString());
  assert.ok(typeof json.startVaddr === 'string');
  assert.ok(Array.isArray(json.instructions));
});

test('service worker is served with Service-Worker-Allowed header', async () => {
  const res = await req('/sw.js');
  assert.equal(res.status, 200);
  assert.equal(res.headers['service-worker-allowed'], '/');
  assert.match(res.headers['content-type'], /javascript/);
});
