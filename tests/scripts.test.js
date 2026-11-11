// Run with: node --test tests/*.test.js   (Node 20+, no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const studies = require('../scripts/palette_studies.js');

// Minimal stand-in for the Figma Plugin API: enough surface for the builders,
// plus Figma's real 0.01 resize minimum and an optional injected failure.
function mockFigma({ failOnCreate = -1 } = {}) {
  const nodes = [];
  let n = 0;
  const make = (type) => {
    if (nodes.length + 1 === failOnCreate) throw new Error('simulated Figma API failure');
    const node = {
      id: `${type}:${++n}`, type, children: [], removed: false,
      appendChild(child) { this.children.push(child); },
      resize(w, h) { if (!(w >= 0.01 && h >= 0.01)) throw new Error(`resize ${w}x${h}`); this.width = w; this.height = h; },
      remove() { const drop = (x) => { x.removed = true; x.children.forEach(drop); }; drop(this); },
    };
    nodes.push(node);
    return node;
  };
  const figma = {
    currentPage: { id: '0:1' },
    createFrame: () => make('FRAME'),
    createRectangle: () => make('RECTANGLE'),
    createVector: () => make('VECTOR'),
  };
  return { figma, nodes, live: () => nodes.filter((x) => !x.removed) };
}

// The Figma helpers are meant to be inlined into one execution context.
function loadBuilders() {
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(`${read('scripts/figma_native.js')}\n${read('scripts/blue_orange_studies.js')}\n`
    + 'this.buildMesh = buildMesh; this.buildBlueOrangeStudies = buildBlueOrangeStudies;', ctx);
  return ctx;
}
const { buildMesh, buildBlueOrangeStudies } = loadBuilders();
const region = (o) => ({ color: '#7398d1', x: 0.5, y: 0.5, rx: 0.4, ry: 0.4, ...o });
const sha = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const snapshot = (nodes) => nodes.map(({ appendChild, resize, remove, children, ...rest }) => ({ ...rest, children: children.map((c) => c.id) }));

test('buildMesh creates one group, mask and fill per region', () => {
  const { figma, live } = mockFigma();
  const out = buildMesh(figma, { width: 1536, height: 1024, x: 0, y: 0, regions: [region(), region({ angle: 30, alpha: 0.5 })] });
  assert.equal(out.regionCount, 2);
  assert.equal(out.createdNodeIds.length, 1 + 2 * 3);
  assert.equal(live().length, out.createdNodeIds.length);
});

test('buildMesh rejects sizes below Figma minimum before creating nodes', () => {
  for (const spec of [
    { width: 0.001, height: 100, x: 0, y: 0, regions: [region()] },
    { width: 100, height: 100, x: 0, y: 0, regions: [region(), region({ rx: 1e-5 })] },
  ]) {
    const { figma, nodes } = mockFigma();
    assert.throws(() => buildMesh(figma, spec));
    assert.equal(nodes.length, 0, 'no node may be created for an invalid recipe');
  }
});

test('buildMesh rolls back when the Figma API fails mid-build', () => {
  const { figma, nodes, live } = mockFigma({ failOnCreate: 6 });
  assert.throws(() => buildMesh(figma, { width: 100, height: 100, x: 0, y: 0, regions: [region(), region()] }), /simulated/);
  assert.ok(nodes.length > 0);
  assert.equal(live().length, 0);
});

test('buildBlueOrangeStudies rolls back every board on failure', () => {
  const { figma, live } = mockFigma({ failOnCreate: 30 });
  assert.throws(() => buildBlueOrangeStudies(figma, { x: 0, y: 0 }), /simulated/);
  assert.equal(live().length, 0);
});

test('buildBlueOrangeStudies emits well-formed, scaled vector paths', () => {
  for (const [width, height] of [[1536, 1024], [999, 666], [6000, 4000]]) {
    for (const heightmap of [{}, { detail: 2, warp: 2, levels: 80 }, { levels: 12 }]) {
      const { figma, nodes } = mockFigma();
      const out = buildBlueOrangeStudies(figma, { x: 0, y: 0, width, height, heightmap });
      assert.equal(out.boards.length, 6);
      const levels = heightmap.levels ?? 40;
      assert.equal(out.boards.find((b) => b.key === 'heightmap').contourTopology.length, levels);
      for (const v of nodes.filter((x) => x.type === 'VECTOR')) {
        for (const { data } of v.vectorPaths) {
          assert.doesNotMatch(data, /NaN|Infinity|undefined|e[-+]?\d/i);
          assert.equal(data.match(/-?\d+(?:\.\d+)?/g).length % 2, 0, 'coordinates must come in x/y pairs');
        }
      }
    }
  }
});

test('Figma builder output is unchanged for the reference studies', () => {
  // If you change the builders on purpose, print sha(snapshot(nodes)) and update these.
  const { figma, nodes } = mockFigma();
  buildBlueOrangeStudies(figma, { x: 0, y: 0 });
  assert.equal(sha(snapshot(nodes)), 'ebc9e4bc5269cfa0b57512a746e8646322667b9a22a586bbe8d48100bdbcc42a');
});

test('unknown palette keys fail with a clear message', () => {
  for (const key of ['nope', 'toString']) {
    assert.throws(() => studies.paletteSVG(key), /Unknown palette/);
    assert.throws(() => studies.layoutSpec(1080, 1080, key), /Unknown palette/);
  }
});

test('layoutSpec chooses layout by aspect ratio', () => {
  assert.equal(studies.layoutSpec(1920, 1080).layout, 'wide');
  assert.equal(studies.layoutSpec(1080, 1080).layout, 'square');
  assert.equal(studies.layoutSpec(1080, 1920).layout, 'portrait');
});

test('palette SVG and CSS output uses rounded numbers', () => {
  for (const key of Object.keys(studies.palettes)) {
    const out = [studies.paletteSVG(key), studies.paletteCSS(studies.palettes[key].colors)];
    for (const [w, h] of [[1920, 1080], [1080, 1080], [1080, 1920], [777, 555]]) out.push(studies.layoutSVG(studies.layoutSpec(w, h, key)));
    for (const s of out) assert.doesNotMatch(s, /\d\.\d{4,}/);
  }
});

test('committed palette SVGs match paletteSVG output', () => {
  const files = { mono: 'mono', adjacent: 'adjacent', contrast: 'blue-orange', neutral: 'neutral' };
  for (const [key, name] of Object.entries(files)) {
    assert.equal(read(`design/illustrations/palette-${name}.svg`), studies.paletteSVG(key),
      `regenerate design/illustrations/palette-${name}.svg from paletteSVG('${key}')`);
  }
});

test('local files referenced by index.html and README.md exist', () => {
  for (const doc of ['index.html', 'README.md']) {
    const refs = [...read(doc).matchAll(/(?:src|href)="([^"#?]+)/g)].map((m) => m[1])
      .filter((r) => !/^[a-z]+:/i.test(r));
    assert.ok(refs.length > 0);
    for (const ref of refs) assert.ok(fs.existsSync(path.join(ROOT, ref)), `${doc} -> ${ref}`);
  }
});
