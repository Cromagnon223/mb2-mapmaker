// MB2 map generator: turns a grid layout into a Quake 3 / Jedi Academy .map file.
// Works in the browser (window.MapGen) and in Node (module.exports) for tests.
(function (root) {
  'use strict';

  var CAULK = 'textures/system/caulk';

  var THEMES = [
    { id: 'imperial', name: 'Imperial base', color: '#7d8a99', floor: 'textures/imperial/basic_floor', wall: 'textures/imperial/basic_wall', ceil: 'textures/imperial/basic_ceiling' },
    { id: 'rebel',    name: 'Rebel hangar',  color: '#a58a62', floor: 'textures/yavin/floor_stone', wall: 'textures/yavin/wall_stone', ceil: 'textures/yavin/ceiling_stone' },
    { id: 'desert',   name: 'Desert town',   color: '#c9a66b', floor: 'textures/tatooine/sand', wall: 'textures/tatooine/wall_adobe', ceil: 'textures/tatooine/wall_adobe' },
    { id: 'snow',     name: 'Snow outpost',  color: '#b9c9d6', floor: 'textures/hoth/snow', wall: 'textures/hoth/ice_wall', ceil: 'textures/hoth/ice_wall' }
  ];
  var SKY = 'textures/skies/yavin';

  // Point entities the editor can place. MB2 team spawns are what Open/Legends rounds use.
  var ENTITIES = {
    imperial: { cls: 'info_player_imperial', label: 'Imperial spawn', ctf: 'team_CTF_redplayer', z: 'floor' },
    rebel:    { cls: 'info_player_rebel', label: 'Rebel spawn', ctf: 'team_CTF_blueplayer', z: 'floor' },
    ffa:      { cls: 'info_player_deathmatch', label: 'Free-for-all spawn', z: 'floor' },
    light:    { cls: 'light', label: 'Light', z: 'ceil' }
  };

  function themeById(state, id) {
    var list = (state && state.themes) || THEMES;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  // Face planes for an axis-aligned box. q3map2 builds the plane normal as
  // (c - a) x (b - a), and that normal must point out of the brush.
  var FACES = [
    { key: 'px', n: [1, 0, 0],  u: [0, 0, 1], v: [0, 1, 0] },
    { key: 'nx', n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { key: 'py', n: [0, 1, 0],  u: [1, 0, 0], v: [0, 0, 1] },
    { key: 'ny', n: [0, -1, 0], u: [0, 0, 1], v: [1, 0, 0] },
    { key: 'pz', n: [0, 0, 1],  u: [0, 1, 0], v: [1, 0, 0] },
    { key: 'nz', n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
  ];

  function fmt(p) { return '( ' + p.map(function (x) { return Math.round(x); }).join(' ') + ' )'; }

  // tex: { top, bottom, sides } texture names.
  function brushBox(min, max, tex) {
    var lines = ['{'];
    FACES.forEach(function (f) {
      var a = [0, 0, 0];
      for (var k = 0; k < 3; k++) a[k] = f.n[k] > 0 ? max[k] : f.n[k] < 0 ? min[k] : min[k];
      var b = a.map(function (x, k) { return x + f.u[k] * 64; });
      var c = a.map(function (x, k) { return x + f.v[k] * 64; });
      var t = f.key === 'pz' ? tex.top : f.key === 'nz' ? tex.bottom : tex.sides;
      lines.push(fmt(a) + ' ' + fmt(b) + ' ' + fmt(c) + ' ' + t + ' 0 0 0 0.5 0.5 0 0 0');
    });
    lines.push('}');
    return lines.join('\n');
  }

  function cellAt(state, i, j) {
    if (i < 0 || j < 0 || i >= state.w || j >= state.h) return null;
    return state.cells[j * state.w + i] || null;
  }

  // Greedy merge of grid cells into rectangles that share the same key.
  // keyFn(i, j) returns a string, or null for "skip".
  function mergeRects(x0, y0, x1, y1, keyFn) {
    var W = x1 - x0, H = y1 - y0, used = new Uint8Array(W * H), out = [];
    for (var j = 0; j < H; j++) {
      for (var i = 0; i < W; i++) {
        if (used[j * W + i]) continue;
        var key = keyFn(i + x0, j + y0);
        if (key === null) continue;
        var w = 1;
        while (i + w < W && !used[j * W + i + w] && keyFn(i + w + x0, j + y0) === key) w++;
        var h = 1, ok = true;
        while (j + h < H && ok) {
          for (var q = 0; q < w; q++) {
            if (used[(j + h) * W + i + q] || keyFn(i + q + x0, j + h + y0) !== key) { ok = false; break; }
          }
          if (ok) h++;
        }
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) used[(j + yy) * W + i + xx] = 1;
        out.push({ i: i + x0, j: j + y0, w: w, h: h, key: key });
      }
    }
    return out;
  }

  // Grid cell (i, j) -> world XY of its min corner. Row 0 is the top (north) of the screen.
  function worldX(state, i) { return (i - state.w / 2) * state.cell; }
  function worldY(state, j) { return (state.h / 2 - j) * state.cell; }

  function bounds(state) {
    var lo = Infinity, hi = -Infinity, count = 0;
    state.cells.forEach(function (c) {
      if (!c) return;
      count++;
      lo = Math.min(lo, c.f); hi = Math.max(hi, c.c);
    });
    if (!count) { lo = 0; hi = 256; }
    return { zMin: lo - 32, zMax: hi + 32, open: count };
  }

  function buildBrushes(state) {
    var b = bounds(state), brushes = [];
    var cellKey = function (i, j) {
      var c = cellAt(state, i, j);
      return c ? [c.f, c.c, c.t, c.sky ? 1 : 0].join('|') : null;
    };
    mergeRects(0, 0, state.w, state.h, cellKey).forEach(function (r) {
      var c = cellAt(state, r.i, r.j), th = themeById(state, c.t);
      var x0 = worldX(state, r.i), x1 = worldX(state, r.i + r.w);
      var y1 = worldY(state, r.j), y0 = worldY(state, r.j + r.h);
      brushes.push(brushBox([x0, y0, b.zMin], [x1, y1, c.f], { top: th.floor, bottom: CAULK, sides: th.wall }));
      brushes.push(brushBox([x0, y0, c.c], [x1, y1, b.zMax], { top: CAULK, bottom: c.sky ? (state.sky || SKY) : th.ceil, sides: c.sky ? (state.sky || SKY) : th.wall }));
    });
    // Solid wall columns: every empty cell (including a one-cell ring outside the grid)
    // that touches an open cell. Together with the floor and ceiling brushes this seals the map.
    var wallKey = function (i, j) {
      if (cellAt(state, i, j)) return null;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
        var n = cellAt(state, i + di, j + dj);
        if (n) return n.t;
      }
      return null;
    };
    mergeRects(-1, -1, state.w + 1, state.h + 1, wallKey).forEach(function (r) {
      var th = themeById(state, r.key);
      var x0 = worldX(state, r.i), x1 = worldX(state, r.i + r.w);
      var y1 = worldY(state, r.j), y0 = worldY(state, r.j + r.h);
      brushes.push(brushBox([x0, y0, b.zMin], [x1, y1, b.zMax], { top: CAULK, bottom: CAULK, sides: th.wall }));
    });
    return brushes;
  }

  function entityOrigin(state, e) {
    var def = ENTITIES[e.type];
    var i = Math.max(0, Math.min(state.w - 1, Math.floor(e.x))), j = Math.max(0, Math.min(state.h - 1, Math.floor(e.y)));
    var c = cellAt(state, i, j) || { f: 0, c: 128 };
    var x = (e.x - state.w / 2) * state.cell, y = (state.h / 2 - e.y) * state.cell;
    var z = def.z === 'ceil' ? c.c - 24 : c.f + 32;
    return [x, y, z];
  }

  function autoLights(state) {
    var out = [];
    mergeRects(0, 0, state.w, state.h, function (i, j) {
      var c = cellAt(state, i, j);
      return c && !c.sky ? c.f + '|' + c.c : null;
    }).forEach(function (r) {
      var c = cellAt(state, r.i, r.j), step = 4;
      for (var y = 0; y < r.h; y += step) for (var x = 0; x < r.w; x += step) {
        var cx = r.i + x + Math.min(step, r.w - x) / 2, cy = r.j + y + Math.min(step, r.h - y) / 2;
        out.push({ type: 'light', x: cx, y: cy, light: 300, auto: true });
      }
    });
    return out;
  }

  function entityBlock(pairs) {
    return '{\n' + pairs.map(function (p) { return '"' + p[0] + '" "' + String(p[1]).replace(/"/g, "'") + '"'; }).join('\n');
  }

  function generateMap(state, opts) {
    opts = opts || {};
    var out = ['// Made with MB2 Map Maker', '// entity 0'];
    var ws = entityBlock([
      ['classname', 'worldspawn'],
      ['message', state.title || state.name],
      ['_ambient', '12'],
      ['_color', '1 1 1'],
      ['gridsize', '64 64 128']
    ]);
    var brushes = buildBrushes(state);
    out.push(ws + '\n' + brushes.map(function (b, k) { return '// brush ' + k + '\n' + b; }).join('\n') + '\n}');
    var ents = state.ents.slice();
    if (opts.autoLights !== false) ents = ents.concat(autoLights(state));
    var n = 1;
    ents.forEach(function (e) {
      var def = ENTITIES[e.type];
      if (!def) return;
      var o = entityOrigin(state, e).join(' ');
      var pairs = [['classname', def.cls], ['origin', o]];
      if (e.type === 'light') pairs.push(['light', e.light || 300]);
      else pairs.push(['angle', Math.round(e.angle || 0)]);
      out.push('// entity ' + (n++) + '\n' + entityBlock(pairs) + '\n}');
      if (def.ctf && opts.ctfSpawns !== false) {
        out.push('// entity ' + (n++) + '\n' + entityBlock([['classname', def.ctf], ['origin', o], ['angle', Math.round(e.angle || 0)]]) + '\n}');
      }
    });
    return out.join('\n') + '\n';
  }

  function generateArena(state) {
    return '{\n\tmap\t\t"' + state.name + '"\n\tlongname\t"' + (state.title || state.name).replace(/"/g, "'") + '"\n\ttype\t\t"ffa team ctf"\n}\n';
  }

  // Plain-language checks shown in the editor before export.
  function check(state) {
    var b = bounds(state), notes = [];
    var count = function (t) { return state.ents.filter(function (e) { return e.type === t; }).length; };
    if (!b.open) notes.push({ level: 'bad', text: 'Paint at least one room.' });
    if (!count('imperial')) notes.push({ level: 'bad', text: 'Add an Imperial spawn.' });
    if (!count('rebel')) notes.push({ level: 'bad', text: 'Add a Rebel spawn.' });
    if (count('imperial') && count('imperial') < 4) notes.push({ level: 'warn', text: 'MB2 rounds need several spawns per team; 4 or more each is safer.' });
    if (count('rebel') && count('rebel') < 4 && count('imperial') >= 4) notes.push({ level: 'warn', text: 'Rebels have fewer than 4 spawns.' });
    state.ents.forEach(function (e) {
      if (!cellAt(state, Math.floor(e.x), Math.floor(e.y))) notes.push({ level: 'bad', text: ENTITIES[e.type].label + ' sits inside a wall.' });
    });
    state.cells.forEach(function (c, k) {
      if (c && c.c - c.f < 96) notes.push({ level: 'bad', text: 'A room at row ' + Math.floor(k / state.w) + ' is lower than 96 units; players will not fit.' });
    });
    if (!/^[a-z0-9_]+$/.test(state.name)) notes.push({ level: 'bad', text: 'File name may only use lowercase letters, numbers and _.' });
    var seen = {};
    return notes.filter(function (n) { if (seen[n.text]) return false; seen[n.text] = 1; return true; });
  }

  var api = { THEMES: THEMES, ENTITIES: ENTITIES, SKY: SKY, generateMap: generateMap, generateArena: generateArena, check: check, buildBrushes: buildBrushes, brushBox: brushBox, mergeRects: mergeRects, bounds: bounds, themeById: themeById, cellAt: cellAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapGen = api;
})(this);
