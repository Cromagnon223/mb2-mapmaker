// Run: node tests/mapgen.test.js
const assert = require('assert');
const G = require('../editor/mapgen.js');

function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function parsePlanes(brush) {
  return brush.split('\n').filter(l => l.startsWith('(')).map(l => {
    const nums = l.match(/\(([^)]*)\)/g).map(s => s.slice(1, -1).trim().split(/\s+/).map(Number));
    return nums;
  });
}

// 1. Every face normal of a box points outward (q3map2: normal = (c-a) x (b-a)).
const box = G.brushBox([0, 0, 0], [64, 128, 256], { top: 't', bottom: 'b', sides: 's' });
const center = [32, 64, 128];
parsePlanes(box).forEach(([a, b, c]) => {
  const n = cross(c.map((x, k) => x - a[k]), b.map((x, k) => x - a[k]));
  const toCenter = center.map((x, k) => x - a[k]);
  assert(n[0]*toCenter[0] + n[1]*toCenter[1] + n[2]*toCenter[2] < 0, 'normal must point away from the brush center');
});

// 2. A sample layout produces a sane map.
const w = 8, h = 6, cells = new Array(w * h).fill(null);
for (let j = 1; j < 5; j++) for (let i = 1; i < 7; i++) cells[j * w + i] = { f: i < 4 ? 0 : 32, c: 256, t: 'imperial', sky: i === 6 };
const state = { name: 'mb2_test', title: 'Test', cell: 64, w, h, cells, ents: [
  { type: 'imperial', x: 1.5, y: 1.5, angle: 0 }, { type: 'rebel', x: 5.5, y: 3.5, angle: 180 }
] };
const map = G.generateMap(state);
assert(map.includes('"classname" "worldspawn"'));
assert(map.includes('info_player_imperial') && map.includes('team_CTF_blueplayer'));
assert.strictEqual((map.match(/\{/g) || []).length, (map.match(/\}/g) || []).length, 'braces balance');
const brushes = G.buildBrushes(state);
brushes.forEach(b => assert.strictEqual(parsePlanes(b).length, 6));
// All 6x4 open cells merge into few rects; a 1-cell wall ring fills the gap to the grid edge.
assert(brushes.length < 20, 'merging keeps brush count low: ' + brushes.length);

// 3. Seal: every open cell's 8 neighbours are open or covered by a wall brush.
const walls = G.mergeRects(-1, -1, w + 1, h + 1, (i, j) => {
  if (G.cellAt(state, i, j)) return null;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (G.cellAt(state, i + di, j + dj)) return 'x';
  return null;
});
const covered = (i, j) => walls.some(r => i >= r.i && i < r.i + r.w && j >= r.j && j < r.j + r.h);
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (G.cellAt(state, i, j))
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++)
    assert(G.cellAt(state, i + di, j + dj) || covered(i + di, j + dj), `leak next to ${i},${j}`);

// 4. Checks flag a missing team.
assert(G.check({ ...state, ents: [] }).some(n => /Imperial/.test(n.text)));
assert(G.generateArena(state).includes('map\t\t"mb2_test"'));
console.log('mapgen: all checks passed (' + brushes.length + ' brushes)');
