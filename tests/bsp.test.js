// Run: node tests/bsp.test.js [out.bsp]
// Parses the compiled .bsp back and checks the structure the engine relies on.
const assert = require('assert');
const fs = require('fs');
const G = require('../editor/mapgen.js');
const B = require('../editor/bsp.js');

const state = G.sampleMap();
const { bsp, stats } = B.compile(state);
const dv = new DataView(bsp.buffer);
assert.strictEqual(String.fromCharCode(...bsp.slice(0, 4)), 'RBSP');
assert.strictEqual(dv.getInt32(4, true), 1);
const SIZES = { 1: 72, 2: 16, 3: 36, 4: 48, 5: 4, 6: 4, 7: 40, 8: 12, 9: 12, 10: 80, 11: 4, 13: 148, 15: 30, 17: 2 };
const lump = k => ({ ofs: dv.getInt32(8 + k * 8, true), len: dv.getInt32(12 + k * 8, true) });
const count = k => { const l = lump(k); assert.strictEqual(l.len % SIZES[k], 0, 'lump ' + k + ' size'); return l.len / SIZES[k]; };
Object.keys(SIZES).forEach(k => { const l = lump(+k); assert(l.ofs + l.len <= bsp.length); count(+k); });
const n = { planes: count(2), nodes: count(3), leafs: count(4), lsurf: count(5), lbrush: count(6), brushes: count(8), sides: count(9), verts: count(10), idx: count(11), surfs: count(13), shaders: count(1) };
assert(n.nodes > 0 && n.leafs > 0 && n.surfs > 0 && n.brushes > 0);
const I = (k, i, size, field) => dv.getInt32(lump(k).ofs + i * size + field * 4, true);
// nodes point at valid planes and children
for (let i = 0; i < n.nodes; i++) {
  assert(I(3, i, 36, 0) < n.planes && I(3, i, 36, 0) % 2 === 0);
  for (const c of [I(3, i, 36, 1), I(3, i, 36, 2)]) assert(c >= 0 ? c < n.nodes && c > i : -1 - c < n.leafs);
}
// leafs reference valid ranges; open leafs have no brushes
let open = 0;
for (let i = 0; i < n.leafs; i++) {
  const cl = I(4, i, 48, 0), fs_ = I(4, i, 48, 8), ns = I(4, i, 48, 9), fb = I(4, i, 48, 10), nb = I(4, i, 48, 11);
  assert(fs_ + ns <= n.lsurf && fb + nb <= n.lbrush);
  if (cl === 0) { open++; assert.strictEqual(nb, 0, 'open leaf has brushes'); }
}
assert(open > 0);
// brush sides: 6 per brush, ordered -X +X -Y +Y -Z +Z, giving min < max
const P = i => { const o = lump(2).ofs + i * 16; return [0, 1, 2, 3].map(k => dv.getFloat32(o + k * 4, true)); };
for (let b = 0; b < n.brushes; b++) {
  const first = I(8, b, 12, 0); assert.strictEqual(I(8, b, 12, 1), 6);
  const s = [0, 1, 2, 3, 4, 5].map(k => P(I(9, first + k, 12, 0)));
  for (let a = 0; a < 3; a++) {
    assert.strictEqual(s[a * 2][a], -1); assert.strictEqual(s[a * 2 + 1][a], 1);
    assert(-s[a * 2][3] < s[a * 2 + 1][3], 'brush ' + b + ' has volume');
  }
}
// surfaces: indexes stay inside their vertex range; triangles wind clockwise seen from the front
const V = i => { const o = lump(10).ofs + i * 80; return [0, 1, 2].map(k => dv.getFloat32(o + k * 4, true)); };
for (let s = 0; s < n.surfs; s++) {
  const fv = I(13, s, 148, 3), nv = I(13, s, 148, 4), fi = I(13, s, 148, 5), ni = I(13, s, 148, 6);
  assert(nv <= 64, 'MAX_FACE_POINTS');
  const o = lump(13).ofs + s * 148 + 112, nrm = [0, 1, 2].map(k => dv.getFloat32(o + k * 4, true));
  for (let t = 0; t < ni; t += 3) {
    const tri = [0, 1, 2].map(k => dv.getInt32(lump(11).ofs + (fi + t + k) * 4, true));
    tri.forEach(x => assert(x >= 0 && x < nv));
    const [a, b, c] = tri.map(x => V(fv + x));
    const u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]);
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert(cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] < 0, 'clockwise winding');
  }
}
// entity lump has both team spawns, 16 each
const ents = Buffer.from(bsp.slice(lump(0).ofs, lump(0).ofs + lump(0).len)).toString('latin1');
assert.strictEqual((ents.match(/info_player_siegeteam1/g) || []).length, 16);
assert.strictEqual((ents.match(/info_player_siegeteam2/g) || []).length, 16);
assert(ents.endsWith('\0') && !/"light"/.test(ents));
// Collision: walk the tree like the engine's point-contents test and compare with the layout.
const planeOf = i => P(i);
function pointSolid(p) {
  let node = 0;
  while (node >= 0) {
    const pl = planeOf(I(3, node, 36, 0)), d = pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] - pl[3];
    node = d >= 0 ? I(3, node, 36, 1) : I(3, node, 36, 2);
  }
  const leaf = -1 - node, fb = I(4, leaf, 48, 10), nb = I(4, leaf, 48, 11);
  for (let k = 0; k < nb; k++) {
    const b = dv.getInt32(lump(6).ofs + (fb + k) * 4, true), first = I(8, b, 12, 0);
    if ([0, 1, 2, 3, 4, 5].every(q => { const pl = P(I(9, first + q, 12, 0)); return pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] - pl[3] < 0; })) return true;
  }
  return false;
}
let checked = 0, rnd = 1;
const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const zr = G.bounds(state);
for (let t = 0; t < 20000; t++) {
  const x = (rand() - 0.5) * state.w * 64, y = (rand() - 0.5) * state.h * 64, z = zr.zMin + rand() * (zr.zMax - zr.zMin);
  const c = G.toCell(state, x, y), cell = G.cellAt(state, c.i, c.j);
  const air = !!cell && z > cell.f + 0.5 && z < cell.c - 0.5;
  const nearWall = cell === null && [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].some(d => G.cellAt(state, c.i + d[0], c.j + d[1]));
  if (!air && !cell && !nearWall) continue; // the void outside the outer walls
  const edge = Math.abs(x / 64 - Math.round(x / 64)) < 0.02 || Math.abs(y / 64 - Math.round(y / 64)) < 0.02;
  if (edge || (cell && (Math.abs(z - cell.f) < 1 || Math.abs(z - cell.c) < 1))) continue;
  assert.strictEqual(pointSolid([x, y, z]), !air, `collision mismatch at ${x|0},${y|0},${z|0}`);
  checked++;
}
assert(checked > 5000);
if (process.argv[2]) fs.writeFileSync(process.argv[2], bsp);
console.log('bsp: all checks passed', JSON.stringify({ bytes: bsp.length, ...stats, shaders: stats.shaders.length }));
