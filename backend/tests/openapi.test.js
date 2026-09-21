const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSpec } = require('../src/docs/openapi');

// Menjaga dokumentasi Swagger tetap sinkron dengan route Express yang sebenarnya.
const MOUNTS = [
  ['/auth', require('../src/routes/auth').router],
  ['/public', require('../src/routes/public').router],
  ['/admin', require('../src/routes/admin').router],
  ['', require('../src/routes/member').router],
];

function actualRoutes() {
  const found = new Set(['GET /health']); // didefinisikan langsung di app.js
  for (const [prefix, router] of MOUNTS) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const paths = [].concat(layer.route.path);
      for (const p of paths) {
        for (const method of Object.keys(layer.route.methods)) {
          found.add(`${method.toUpperCase()} ${prefix}${p}`.replace(/:(\w+)/g, '{$1}'));
        }
      }
    }
  }
  return found;
}

function documentedRoutes() {
  const found = new Set();
  for (const [p, ops] of Object.entries(buildSpec().paths)) {
    for (const method of Object.keys(ops)) found.add(`${method.toUpperCase()} ${p}`);
  }
  return found;
}

test('semua route Express terdokumentasi di OpenAPI', () => {
  const doc = documentedRoutes();
  const missing = [...actualRoutes()].filter((r) => !doc.has(r));
  assert.deepEqual(missing, [], `Route belum ada di src/docs/openapi.js: ${missing.join(', ')}`);
});

test('tidak ada dokumentasi untuk route yang sudah tidak ada', () => {
  const actual = actualRoutes();
  const stale = [...documentedRoutes()].filter((r) => !actual.has(r));
  assert.deepEqual(stale, [], `Ada di openapi.js tapi tidak ada di route: ${stale.join(', ')}`);
});

test('semua $ref schema terdefinisi', () => {
  const spec = buildSpec();
  const refs = [...JSON.stringify(spec).matchAll(/#\/components\/schemas\/(\w+)/g)].map((m) => m[1]);
  const missing = [...new Set(refs)].filter((r) => !spec.components.schemas[r]);
  assert.deepEqual(missing, []);
});
