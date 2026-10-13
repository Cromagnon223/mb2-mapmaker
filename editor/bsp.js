// In-browser map compiler: turns the grid layout into a Jedi Academy .bsp (RBSP v1).
// The layout is made of axis-aligned boxes, so the BSP tree, collision brushes, visible
// faces and vertex lighting can all be built directly, without q3map2.
// Works in the browser (window.MapBSP) and in Node (module.exports) for tests.
(function (root) {
  'use strict';
  var G = (typeof module !== 'undefined' && module.exports) ? require('./mapgen.js') : root.MapGen;

  var CONTENTS_SOLID = 0x1, CONTENTS_OPAQUE = 0x8000;
  var SURF_SKY = 0x2000, SURF_NOIMPACT = 0x80000, SURF_NOMARKS = 0x100000;
  var LIGHTMAP_BY_VERTEX = -3;
  var GRID = [64, 64, 128]; // the engine's default light grid size

  // ---------- visible faces ----------
  // Each open cell shows a floor, a ceiling and whatever wall or step is beside it.
  function buildFaces(state) {
    var faces = [], S = state.cell;
    function add(shader, n, corner, uAxis, uLen, vAxis, vLen) {
      faces.push({ shader: shader, n: n, o: corner, u: uAxis, ul: uLen, v: vAxis, vl: vLen });
    }
    for (var j = 0; j < state.h; j++) for (var i = 0; i < state.w; i++) {
      var c = G.cellAt(state, i, j);
      if (!c) continue;
      var th = G.themeById(c.t);
      var x0 = G.worldX(state, i), x1 = x0 + S, y1 = G.worldY(state, j), y0 = y1 - S;
      add(th.floor, [0, 0, 1], [x0, y0, c.f], 0, S, 1, S);
      add(c.sky ? G.SKY : th.ceil, [0, 0, -1], [x0, y0, c.c], 0, S, 1, S);
      // neighbours: east, west, north, south. n points from the wall into this cell.
      [
        { di: 1, dj: 0, n: [-1, 0, 0], o: [x1, y0], axis: 1 },
        { di: -1, dj: 0, n: [1, 0, 0], o: [x0, y0], axis: 1 },
        { di: 0, dj: -1, n: [0, -1, 0], o: [x0, y1], axis: 0 },
        { di: 0, dj: 1, n: [0, 1, 0], o: [x0, y0], axis: 0 }
      ].forEach(function (d) {
        var nb = G.cellAt(state, i + d.di, j + d.dj);
        var wall = function (z0, z1, shader) {
          if (z1 - z0 < 0.5) return;
          add(shader, d.n, [d.o[0], d.o[1], z0], d.axis, S, 2, z1 - z0);
        };
        if (!nb) { wall(c.f, c.c, th.wall); return; }
        var nt = G.themeById(nb.t);
        if (nb.f > c.f) wall(c.f, Math.min(nb.f, c.c), nt.wall);
        if (nb.c < c.c) wall(Math.max(nb.c, c.f), c.c, nb.sky ? G.SKY : nt.wall);
      });
    }
    return faces;
  }

  // ---------- lighting ----------
  // Vertex colours: soft ambient, point lights with shadows, and sunlight under open sky.
  function makeLighter(state, opts) {
    var S = state.cell, b = G.bounds(state), scale = opts.brightness || 1;
    var lights = G.entityList(state, opts).filter(function (e) { return e.light; });
    var hasSky = state.cells.some(function (c) { return c && c.sky; });
    var sun = norm([0.45, 0.3, 0.9]);
    function solid(x, y, z) {
      var p = G.toCell(state, x, y), c = G.cellAt(state, p.i, p.j);
      if (!c) return 2;
      if (z < c.f - 0.5) return 2;
      if (z > c.c + 0.5) return c.sky ? 1 : 2; // 1 = sky above, open to the sun
      return 0;
    }
    function visible(p, q) {
      var d = sub(q, p), len = Math.hypot(d[0], d[1], d[2]), steps = Math.ceil(len / 12);
      for (var k = 1; k < steps; k++) {
        var t = k / steps;
        if (solid(p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t)) return false;
      }
      return true;
    }
    function sunlit(p) {
      for (var t = 12; t < 4096; t += 12) {
        var z = p[2] + sun[2] * t, s = solid(p[0] + sun[0] * t, p[1] + sun[1] * t, z);
        if (s === 1) return true;
        if (s === 2 || z > b.zMax) return false;
      }
      return false;
    }
    return function (p, n) {
      var q = [p[0] + n[0] * 2, p[1] + n[1] * 2, p[2] + n[2] * 2];
      var r = 30, g = 30, bl = 34;
      lights.forEach(function (L) {
        var d = sub(L.origin, q), dist = Math.hypot(d[0], d[1], d[2]), radius = L.light * 1.6;
        if (dist >= radius) return;
        var lam = Math.max(0, dot(n, d) / (dist || 1));
        if (lam <= 0 || !visible(q, L.origin)) return;
        var k = (1 - dist / radius) * (0.3 + 0.7 * lam) * 90 * (L.light / 300);
        r += k; g += k * 0.96; bl += k * 0.88;
      });
      if (hasSky) {
        var at = G.toCell(state, q[0], q[1]), here = G.cellAt(state, at.i, at.j);
        if (here && here.sky) { r += 26; g += 30; bl += 38; } // soft fill from the open sky
        var lam = dot(n, sun);
        if (lam > 0 && sunlit(q)) { var k = 120 * lam; r += k; g += k * 0.94; bl += k * 0.8; }
      }
      return [clamp(r * scale), clamp(g * scale), clamp(bl * scale)];
    };
  }
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x))); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }

  // Split a face into a grid of points: every 32 units along each side, and at every
  // multiple of 32 in absolute coordinates so neighbouring walls share vertices.
  function cuts(start, len) {
    var out = [0];
    for (var x = Math.floor(start / 32) * 32 + 32; x < start + len - 0.5; x += 32) out.push(x - start);
    out.push(len);
    if (out.length > 16) { out = []; for (var k = 0; k <= 15; k++) out.push(len * k / 15); }
    return out;
  }

  // ---------- BSP writer ----------
  function compile(state, opts) {
    opts = opts || {};
    var light = makeLighter(state, opts);

    // shaders
    var shaders = [], shaderIndex = {};
    function shaderNum(name) {
      if (shaderIndex[name] !== undefined) return shaderIndex[name];
      var sky = name === G.SKY;
      shaders.push({ name: name, surf: sky ? SURF_SKY | SURF_NOIMPACT | SURF_NOMARKS : 0, contents: CONTENTS_SOLID | CONTENTS_OPAQUE });
      return (shaderIndex[name] = shaders.length - 1);
    }

    // planes, stored in pairs like q3map2: even = axis-positive normal, odd = its flip
    var planes = [], planeIndex = {};
    function axisPlane(axis, dist) {
      var key = axis + ':' + dist;
      if (planeIndex[key] === undefined) {
        var n = [0, 0, 0]; n[axis] = 1;
        planes.push({ n: n, d: dist });
        planes.push({ n: n.map(function (x) { return -x; }), d: -dist });
        planeIndex[key] = planes.length - 2;
      }
      return planeIndex[key];
    }

    // brushes
    var boxes = G.brushList(state);
    var brushes = [], sides = [];
    boxes.forEach(function (bx) {
      var first = sides.length, wallShader = shaderNum(bx.tex.sides);
      // order matters: the engine reads the brush bounds from sides 0..5 as -X +X -Y +Y -Z +Z
      for (var axis = 0; axis < 3; axis++) {
        var texMin = axis === 2 ? bx.tex.bottom : bx.tex.sides, texMax = axis === 2 ? bx.tex.top : bx.tex.sides;
        sides.push({ plane: axisPlane(axis, bx.min[axis]) + 1, shader: shaderNum(texMin) });
        sides.push({ plane: axisPlane(axis, bx.max[axis]), shader: shaderNum(texMax) });
      }
      brushes.push({ first: first, num: 6, shader: wallShader });
    });

    // draw surfaces with vertex lighting
    var verts = [], indexes = [], surfaces = [];
    buildFaces(state).forEach(function (f) {
      var us = cuts(f.o[f.u], f.ul), vs = cuts(f.o[f.v], f.vl), first = verts.length;
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      vs.forEach(function (dv) {
        us.forEach(function (du) {
          var p = f.o.slice(); p[f.u] += du; p[f.v] += dv;
          for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
          // textures repeat every 128 units
          var s, t;
          if (f.n[2]) { s = p[0] / 128; t = -p[1] / 128; } else { s = (f.n[0] ? p[1] : p[0]) / 128; t = -p[2] / 128; }
          verts.push({ p: p, st: [s, t], n: f.n, c: f.shader === G.SKY ? [255, 255, 255] : light(p, f.n) });
        });
      });
      var nu = us.length, firstIndex = indexes.length;
      for (var a = 0; a < vs.length - 1; a++) for (var b2 = 0; b2 < nu - 1; b2++) {
        var i0 = a * nu + b2, i1 = i0 + 1, i2 = i0 + nu, i3 = i2 + 1;
        // winding: the engine culls faces whose vertices run clockwise seen from the front
        var cr = cross(axisVec(f.u), axisVec(f.v)), flip = dot(cr, f.n) > 0;
        if (flip) indexes.push(i0, i2, i1, i1, i2, i3); else indexes.push(i0, i1, i2, i1, i3, i2);
      }
      surfaces.push({ shader: shaderNum(f.shader), firstVert: first, numVerts: verts.length - first, firstIndex: firstIndex,
        numIndexes: indexes.length - firstIndex, n: f.n, min: mn, max: mx });
    });

    // BSP tree over the boxes
    var world = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    boxes.forEach(function (bx) { for (var k = 0; k < 3; k++) { world.min[k] = Math.min(world.min[k], bx.min[k]); world.max[k] = Math.max(world.max[k], bx.max[k]); } });
    var nodes = [], leafs = [], leafSurfaces = [], leafBrushes = [];
    function inside(p) {
      var c = G.toCell(state, p[0], p[1]), cell = G.cellAt(state, c.i, c.j);
      return !!cell && p[2] > cell.f && p[2] < cell.c;
    }
    function overlaps(b, mn, mx) { // interior overlap
      for (var k = 0; k < 3; k++) if (b.max[k] <= mn[k] || b.min[k] >= mx[k]) return false;
      return true;
    }
    function touches(s, mn, mx) {
      for (var k = 0; k < 3; k++) if (s.max[k] < mn[k] - 0.1 || s.min[k] > mx[k] + 0.1) return false;
      return true;
    }
    function build(mn, mx, boxIds, surfIds) {
      var best = null, extent = -1;
      for (var axis = 0; axis < 3; axis++) {
        var mid = (mn[axis] + mx[axis]) / 2, cand = null;
        boxIds.forEach(function (id) {
          [boxes[id].min[axis], boxes[id].max[axis]].forEach(function (v) {
            if (v > mn[axis] && v < mx[axis] && (cand === null || Math.abs(v - mid) < Math.abs(cand - mid))) cand = v;
          });
        });
        if (cand !== null && mx[axis] - mn[axis] > extent) { extent = mx[axis] - mn[axis]; best = { axis: axis, v: cand }; }
      }
      if (!best) {
        var solidLeaf = boxIds.length > 0;
        var center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
        var open = !solidLeaf && inside(center);
        var leaf = { cluster: open ? 0 : -1, min: mn, max: mx, firstSurf: leafSurfaces.length, numSurf: 0, firstBrush: leafBrushes.length, numBrush: boxIds.length };
        boxIds.forEach(function (id) { leafBrushes.push(id); });
        if (open) { surfIds.forEach(function (id) { leafSurfaces.push(id); }); leaf.numSurf = surfIds.length; }
        leafs.push(leaf);
        return -leafs.length; // -(leafIndex + 1)
      }
      var node = { plane: axisPlane(best.axis, best.v), min: mn, max: mx }, index = nodes.length;
      nodes.push(node);
      var hiMin = mn.slice(), loMax = mx.slice();
      hiMin[best.axis] = best.v; loMax[best.axis] = best.v;
      var front = build(hiMin, mx, boxIds.filter(function (id) { return overlaps(boxes[id], hiMin, mx); }), surfIds.filter(function (id) { return touches(surfaces[id], hiMin, mx); }));
      var back = build(mn, loMax, boxIds.filter(function (id) { return overlaps(boxes[id], mn, loMax); }), surfIds.filter(function (id) { return touches(surfaces[id], mn, loMax); }));
      node.children = [front, back];
      return index;
    }
    build(world.min.slice(), world.max.slice(), boxes.map(function (_, k) { return k; }), surfaces.map(function (_, k) { return k; }));

    // light grid: one uniform sample for player models
    var gb = [];
    for (var k = 0; k < 3; k++) {
      var o = GRID[k] * Math.ceil(world.min[k] / GRID[k]), m = GRID[k] * Math.floor(world.max[k] / GRID[k]);
      gb.push(Math.max(1, (m - o) / GRID[k] + 1));
    }
    var gridPoints = gb[0] * gb[1] * gb[2];

    // ---------- serialise ----------
    var lumps = [];
    lumps[0] = utf8(G.entityString(state, opts) + '\0');
    lumps[1] = pack(shaders, 72, function (dv, o, s) { str(dv, o, s.name, 64); dv.setInt32(o + 64, s.surf, true); dv.setInt32(o + 68, s.contents, true); });
    lumps[2] = pack(planes, 16, function (dv, o, p) { f32(dv, o, p.n.concat([p.d])); });
    lumps[3] = pack(nodes, 36, function (dv, o, n) { i32(dv, o, [n.plane, n.children[0], n.children[1]].concat(ints(n.min, -1), ints(n.max, 1))); });
    lumps[4] = pack(leafs, 48, function (dv, o, l) { i32(dv, o, [l.cluster, 0].concat(ints(l.min, -1), ints(l.max, 1), [l.firstSurf, l.numSurf, l.firstBrush, l.numBrush])); });
    lumps[5] = pack(leafSurfaces, 4, function (dv, o, x) { dv.setInt32(o, x, true); });
    lumps[6] = pack(leafBrushes, 4, function (dv, o, x) { dv.setInt32(o, x, true); });
    lumps[7] = pack([0], 40, function (dv, o) { f32(dv, o, world.min.concat(world.max)); i32(dv, o + 24, [0, surfaces.length, 0, brushes.length]); });
    lumps[8] = pack(brushes, 12, function (dv, o, b) { i32(dv, o, [b.first, b.num, b.shader]); });
    lumps[9] = pack(sides, 12, function (dv, o, s) { i32(dv, o, [s.plane, s.shader, -1]); });
    lumps[10] = pack(verts, 80, function (dv, o, v) {
      f32(dv, o, v.p.concat(v.st)); // lightmap coords (32 bytes) stay zero
      f32(dv, o + 52, v.n);
      for (var s = 0; s < 4; s++) { dv.setUint8(o + 64 + s * 4, v.c[0]); dv.setUint8(o + 65 + s * 4, v.c[1]); dv.setUint8(o + 66 + s * 4, v.c[2]); dv.setUint8(o + 67 + s * 4, 255); }
    });
    lumps[11] = pack(indexes, 4, function (dv, o, x) { dv.setInt32(o, x, true); });
    lumps[12] = new Uint8Array(0);
    lumps[13] = pack(surfaces, 148, function (dv, o, s) {
      i32(dv, o, [s.shader, -1, 1, s.firstVert, s.numVerts, s.firstIndex, s.numIndexes]);
      [0, 255, 255, 255, 0, 255, 255, 255].forEach(function (b, k) { dv.setUint8(o + 28 + k, b); });
      i32(dv, o + 36, [LIGHTMAP_BY_VERTEX, LIGHTMAP_BY_VERTEX, LIGHTMAP_BY_VERTEX, LIGHTMAP_BY_VERTEX]);
      // lightmapX/Y, size and origin stay zero; lightmapVecs[2] carries the face normal
      f32(dv, o + 112, s.n);
    });
    lumps[14] = new Uint8Array(0);
    lumps[15] = pack([0], 30, function (dv, o) {
      [70, 70, 74, 70, 70, 74, 70, 70, 74, 70, 70, 74].forEach(function (b, k) { dv.setUint8(o + k, b); });
      [110, 106, 98, 110, 106, 98, 110, 106, 98, 110, 106, 98].forEach(function (b, k) { dv.setUint8(o + 12 + k, b); });
      [0, 255, 255, 255].forEach(function (b, k) { dv.setUint8(o + 24 + k, b); });
      // latLong 0,0 = light straight from above
    });
    lumps[16] = new Uint8Array(0);
    lumps[17] = new Uint8Array(gridPoints * 2); // every grid point uses sample 0

    var header = 8 + 18 * 8, total = header;
    var offsets = lumps.map(function (l) { var o = total; total += (l.length + 3) & ~3; return o; });
    var out = new Uint8Array(total), dv = new DataView(out.buffer);
    out.set([82, 66, 83, 80], 0); // "RBSP"
    dv.setInt32(4, 1, true);
    lumps.forEach(function (l, k) { dv.setInt32(8 + k * 8, offsets[k], true); dv.setInt32(12 + k * 8, l.length, true); out.set(l, offsets[k]); });
    var mesh = { verts: verts, indexes: indexes, surfaces: surfaces, shaders: shaders.map(function (s) { return s.name; }) };
    return { bsp: out, mesh: mesh, stats: { brushes: brushes.length, surfaces: surfaces.length, verts: verts.length, nodes: nodes.length, leafs: leafs.length, shaders: shaders.map(function (s) { return s.name; }) } };
  }

  function axisVec(a) { var v = [0, 0, 0]; v[a] = 1; return v; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function ints(v, dir) { return v.map(function (x) { return dir < 0 ? Math.floor(x) : Math.ceil(x); }); }
  function pack(list, size, write) {
    var buf = new Uint8Array(list.length * size), dv = new DataView(buf.buffer);
    list.forEach(function (item, k) { write(dv, k * size, item); });
    return buf;
  }
  function i32(dv, o, arr) { arr.forEach(function (x, k) { dv.setInt32(o + k * 4, x, true); }); }
  function f32(dv, o, arr) { arr.forEach(function (x, k) { dv.setFloat32(o + k * 4, x, true); }); }
  function str(dv, o, s, len) { for (var k = 0; k < len; k++) dv.setUint8(o + k, k < s.length ? s.charCodeAt(k) : 0); }
  function utf8(s) { var out = new Uint8Array(s.length); for (var k = 0; k < s.length; k++) out[k] = s.charCodeAt(k) & 0x7f; return out; }

  var api = { compile: compile, buildFaces: buildFaces };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapBSP = api;
})(this);
