// MB2 map generator: turns a grid layout into brushes, entities and the text files a
// Movie Battles 2 map needs (.map for Radiant, .arena, .siege).
// Works in the browser (window.MapGen) and in Node (module.exports) for tests.
(function (root) {
  'use strict';

  // Textures ship inside the map's own pk3 (made by textures.js), so nothing depends on
  // guessing Jedi Academy's built-in texture names.
  var TEX = 'textures/mb2mm/';
  var THEMES = [
    { id: 'imperial', name: 'Imperial base', color: '#7d8a99' },
    { id: 'rebel',    name: 'Rebel hangar',  color: '#9a8f6a' },
    { id: 'desert',   name: 'Desert town',   color: '#c9a66b' },
    { id: 'temple',   name: 'Jedi temple',   color: '#b3a58c' },
    { id: 'snow',     name: 'Snow outpost',  color: '#b9c9d6' }
  ].map(function (t) {
    t.floor = TEX + t.id + '_floor'; t.wall = TEX + t.id + '_wall'; t.ceil = TEX + t.id + '_ceil';
    return t;
  });
  var SKY = TEX + 'sky';
  var CAULK = 'textures/system/caulk';

  // MB2 rounds use the siege spawn points: team1 = Rebels, team2 = Imperials.
  var ENTITIES = {
    imperial: { cls: 'info_player_siegeteam2', label: 'Imperial spawn', team: true },
    rebel:    { cls: 'info_player_siegeteam1', label: 'Rebel spawn', team: true },
    ffa:      { cls: 'info_player_deathmatch', label: 'Free-for-all spawn' },
    light:    { cls: 'light', label: 'Light' }
  };
  var TEAM_SPAWNS = 16; // what MB2 mappers recommend per team

  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }

  function cellAt(state, i, j) {
    if (i < 0 || j < 0 || i >= state.w || j >= state.h) return null;
    return state.cells[j * state.w + i] || null;
  }

  // Greedy merge of grid cells into rectangles that share the same key.
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

  // Grid cell (i, j) -> world XY. Row 0 is the top (north) of the screen.
  function worldX(state, i) { return (i - state.w / 2) * state.cell; }
  function worldY(state, j) { return (state.h / 2 - j) * state.cell; }
  function toCell(state, x, y) { return { i: Math.floor(x / state.cell + state.w / 2), j: Math.floor(state.h / 2 - y / state.cell) }; }

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

  // A solid cell next to an open one becomes a wall column; returns the theme to use.
  function wallTheme(state, i, j) {
    if (cellAt(state, i, j)) return null;
    for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
      var n = cellAt(state, i + di, j + dj);
      if (n) return n.t;
    }
    return null;
  }

  // Every solid box in the level: floor and ceiling slabs under/over each open area plus
  // wall columns around it. Together they seal the map (no leaks to the void).
  function brushList(state) {
    var b = bounds(state), out = [];
    mergeRects(0, 0, state.w, state.h, function (i, j) {
      var c = cellAt(state, i, j);
      return c ? [c.f, c.c, c.t, c.sky ? 1 : 0].join('|') : null;
    }).forEach(function (r) {
      var c = cellAt(state, r.i, r.j), th = themeById(c.t);
      var x0 = worldX(state, r.i), x1 = worldX(state, r.i + r.w), y1 = worldY(state, r.j), y0 = worldY(state, r.j + r.h);
      out.push({ min: [x0, y0, b.zMin], max: [x1, y1, c.f], tex: { top: th.floor, bottom: CAULK, sides: th.wall } });
      var up = c.sky ? SKY : th.ceil, side = c.sky ? SKY : th.wall;
      out.push({ min: [x0, y0, c.c], max: [x1, y1, b.zMax], tex: { top: CAULK, bottom: up, sides: side }, sky: !!c.sky });
    });
    mergeRects(-1, -1, state.w + 1, state.h + 1, function (i, j) { return wallTheme(state, i, j); }).forEach(function (r) {
      var th = themeById(r.key);
      var x0 = worldX(state, r.i), x1 = worldX(state, r.i + r.w), y1 = worldY(state, r.j), y0 = worldY(state, r.j + r.h);
      out.push({ min: [x0, y0, b.zMin], max: [x1, y1, b.zMax], tex: { top: CAULK, bottom: CAULK, sides: th.wall } });
    });
    return out;
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
  function brushBox(min, max, tex) {
    var lines = ['{'];
    FACES.forEach(function (f) {
      var a = [0, 0, 0];
      for (var k = 0; k < 3; k++) a[k] = f.n[k] > 0 ? max[k] : min[k];
      var b = a.map(function (x, k) { return x + f.u[k] * 64; });
      var c = a.map(function (x, k) { return x + f.v[k] * 64; });
      var t = f.key === 'pz' ? tex.top : f.key === 'nz' ? tex.bottom : tex.sides;
      lines.push(fmt(a) + ' ' + fmt(b) + ' ' + fmt(c) + ' ' + t + ' 0 0 0 0.5 0.5 0 0 0');
    });
    lines.push('}');
    return lines.join('\n');
  }
  function buildBrushes(state) {
    return brushList(state).map(function (b) { return brushBox(b.min, b.max, b.tex); });
  }

  function floorAt(state, x, y) {
    var c = cellAt(state, Math.floor(x), Math.floor(y));
    return c || { f: 0, c: 128 };
  }

  // Extra spawns so each team reaches TEAM_SPAWNS: spread over free cells near the
  // spawns the mapper placed, facing the same way.
  function extraSpawns(state) {
    var out = [], taken = {};
    state.ents.forEach(function (e) { if (ENTITIES[e.type] && ENTITIES[e.type].team) taken[Math.floor(e.x) + ',' + Math.floor(e.y)] = 1; });
    ['rebel', 'imperial'].forEach(function (type) {
      var mine = state.ents.filter(function (e) { return e.type === type && cellAt(state, Math.floor(e.x), Math.floor(e.y)); });
      var need = TEAM_SPAWNS - mine.length;
      if (!mine.length || need <= 0) return;
      var queue = mine.map(function (e) { return { i: Math.floor(e.x), j: Math.floor(e.y), angle: e.angle || 0 }; });
      var seen = {};
      queue.forEach(function (q) { seen[q.i + ',' + q.j] = 1; });
      while (queue.length && need > 0) {
        var q = queue.shift(), here = cellAt(state, q.i, q.j);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var i = q.i + d[0], j = q.j + d[1], k = i + ',' + j, c = cellAt(state, i, j);
          if (seen[k] || !c || c.c - c.f < 96 || Math.abs(c.f - here.f) > 32) return;
          seen[k] = 1;
          queue.push({ i: i, j: j, angle: q.angle });
          if (!taken[k] && need > 0) { taken[k] = 1; need--; out.push({ type: type, x: i + 0.5, y: j + 0.5, angle: q.angle, auto: true }); }
        });
      }
    });
    return out;
  }

  // Lights placed automatically: one per 4x4 cells of covered floor.
  function autoLights(state) {
    var out = [];
    mergeRects(0, 0, state.w, state.h, function (i, j) {
      var c = cellAt(state, i, j);
      return c && !c.sky ? c.f + '|' + c.c : null;
    }).forEach(function (r) {
      var step = 4;
      for (var y = 0; y < r.h; y += step) for (var x = 0; x < r.w; x += step) {
        out.push({ type: 'light', x: r.i + x + Math.min(step, r.w - x) / 2, y: r.j + y + Math.min(step, r.h - y) / 2, light: 300, auto: true });
      }
    });
    return out;
  }

  function origin(state, e) {
    var c = floorAt(state, e.x, e.y);
    var x = (e.x - state.w / 2) * state.cell, y = (state.h / 2 - e.y) * state.cell;
    return [x, y, e.type === 'light' ? c.c - 24 : c.f + 40];
  }

  // Every point entity the level gets, as { pairs: [[key, value]], origin, light? }.
  function entityList(state, opts) {
    opts = opts || {};
    var ents = state.ents.slice();
    if (opts.extraSpawns !== false) ents = ents.concat(extraSpawns(state));
    if (opts.autoLights !== false) ents = ents.concat(autoLights(state));
    var out = [];
    ents.forEach(function (e) {
      var def = ENTITIES[e.type];
      if (!def) return;
      var o = origin(state, e), os = o.map(Math.round).join(' ');
      if (e.type === 'light') { out.push({ pairs: [['classname', 'light'], ['origin', os], ['light', e.light || 300]], origin: o, light: e.light || 300 }); return; }
      var ang = Math.round(e.angle || 0);
      out.push({ pairs: [['classname', def.cls], ['origin', os], ['angle', ang]], origin: o });
      // Team spawns double as free-for-all spawns so duel and FFA modes work too.
      if (def.team) out.push({ pairs: [['classname', 'info_player_deathmatch'], ['origin', os], ['angle', ang]], origin: o });
    });
    // Spectator camera and end-of-round view: above the middle of the map.
    var mid = middleCell(state);
    if (mid) {
      var c = cellAt(state, mid.i, mid.j), x = worldX(state, mid.i) + state.cell / 2, y = worldY(state, mid.j) - state.cell / 2;
      var z = Math.round(c.f + Math.min(c.c - c.f - 16, 160));
      out.push({ pairs: [['classname', 'info_player_intermission'], ['origin', [x, y, z].join(' ')], ['angles', '30 0 0']], origin: [x, y, z] });
      out.push({ pairs: [['classname', 'info_player_start'], ['origin', [x, y, c.f + 40].join(' ')], ['angle', 0]], origin: [x, y, c.f + 40] });
    }
    return out;
  }

  function middleCell(state) {
    var best = null, bd = Infinity;
    for (var j = 0; j < state.h; j++) for (var i = 0; i < state.w; i++) {
      if (!cellAt(state, i, j)) continue;
      var d = Math.pow(i - state.w / 2, 2) + Math.pow(j - state.h / 2, 2);
      if (d < bd) { bd = d; best = { i: i, j: j }; }
    }
    return best;
  }

  function quote(v) { return '"' + String(v).replace(/"/g, "'") + '"'; }
  function worldspawnPairs(state) {
    return [['classname', 'worldspawn'], ['message', state.title || state.name], ['_ambient', '12']];
  }
  function entityText(pairs) { return '{\n' + pairs.map(function (p) { return quote(p[0]) + ' ' + quote(p[1]); }).join('\n') + '\n}\n'; }

  // Radiant .map source (for people who want to keep editing in Radiant).
  function generateMap(state, opts) {
    var out = '// Made with MB2 Map Maker\n// entity 0\n{\n' +
      worldspawnPairs(state).map(function (p) { return quote(p[0]) + ' ' + quote(p[1]); }).join('\n') + '\n' +
      buildBrushes(state).join('\n') + '\n}\n';
    entityList(state, opts).forEach(function (e) { out += entityText(e.pairs); });
    return out;
  }
  // The entity lump of the compiled .bsp: same as the .map without brushes or lights.
  function entityString(state, opts) {
    var out = entityText(worldspawnPairs(state));
    entityList(state, opts).forEach(function (e) { if (!e.light) out += entityText(e.pairs); });
    return out;
  }

  function generateArena(state) {
    return '{\n\tmap\t\t"' + state.name + '"\n\tlongname\t' + quote(state.title || state.name) + '\n\tfraglimit\t10\n\ttype\t\t"MB"\n}\n';
  }

  // Round rules MB2 reads from maps/<name>.siege. Shape follows the MB2 forum example.
  function generateSiege(state) {
    var time = Math.max(60, Math.round((state.roundMinutes || 5) * 60));
    return [
      '//This file should never exceed 16384 bytes.',
      'Teams', '{', '\tteam1\tRebels', '\tteam2\tImperials', '}', '',
      'mapgraphic\t"levelshots/' + state.name + '"', '',
      'Rebels', '{',
      '\tRequiredObjectives\t1', '\tTimed\t' + time, '\tattackers\t1', '\tUseTeam\t"DeathStar_Rebels"', '\troundover_target\t"siegeend"',
      '\tObjective1', '\t{', '\t\tgoalname\t"ACCOMPLISH: Defeat the Imperials!"', '\t\tfinal\t1', '\t}', '}', '',
      'Imperials', '{',
      '\tRequiredObjectives\t1', '\tattackers\t0', '\tUseTeam\t"DeathStar_Imperials"', '\troundover_target\t"siegeend"',
      '\tObjective1', '\t{', '\t\tgoalname\t"ACCOMPLISH: Defeat the Rebels!"', '\t\tfinal\t1', '\t}', '}', ''
    ].join('\r\n');
  }

  // Plain-language checks shown in the editor. fix names a one-click fix the editor offers.
  function check(state) {
    var b = bounds(state), notes = [];
    var count = function (t) { return state.ents.filter(function (e) { return e.type === t; }).length; };
    if (!b.open) notes.push({ level: 'bad', text: 'Paint some floor first: pick Room and drag on the grid.' });
    if (b.open && !count('rebel')) notes.push({ level: 'bad', text: 'Rebels have nowhere to start.', fix: 'spawns' });
    if (b.open && !count('imperial')) notes.push({ level: 'bad', text: 'Imperials have nowhere to start.', fix: 'spawns' });
    var stuck = state.ents.filter(function (e) { return !cellAt(state, Math.floor(e.x), Math.floor(e.y)); });
    if (stuck.length) notes.push({ level: 'bad', text: stuck.length + ' marker' + (stuck.length > 1 ? 's are' : ' is') + ' inside a wall.', fix: 'stuck' });
    var low = state.cells.filter(function (c) { return c && c.c - c.f < 96; }).length;
    if (low) notes.push({ level: 'bad', text: low + ' floor square' + (low > 1 ? 's have' : ' has') + ' a ceiling too low for players.', fix: 'low' });
    var steep = 0;
    for (var j = 0; j < state.h; j++) for (var i = 0; i < state.w; i++) {
      var c = cellAt(state, i, j); if (!c) continue;
      [[1, 0], [0, 1]].forEach(function (d) { var n = cellAt(state, i + d[0], j + d[1]); if (n && Math.abs(n.f - c.f) > 64 && Math.abs(n.f - c.f) < 9999) steep++; });
    }
    if (steep) notes.push({ level: 'warn', text: 'Some ledges are taller than 64 units; players can only reach them by jumping or with the Force.' });
    if (count('rebel') && count('imperial') && (count('rebel') < TEAM_SPAWNS || count('imperial') < TEAM_SPAWNS))
      notes.push({ level: 'info', text: 'Extra spawns are added around yours so each team has ' + TEAM_SPAWNS + '.' });
    return notes;
  }

  function slug(title) {
    var s = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    return 'mb2_' + (s || 'mymap').replace(/^mb2_/, '');
  }

  // Starter spawns: 4 per team at opposite ends of the map, facing each other.
  function autoSpawns(state) {
    var open = [];
    for (var j = 0; j < state.h; j++) for (var i = 0; i < state.w; i++) {
      var c = cellAt(state, i, j);
      if (c && c.c - c.f >= 96) open.push({ i: i, j: j });
    }
    if (open.length < 2) return [];
    // ends of the longer axis, nudged toward the middle row so spawns are not jammed in a corner
    var wide = state.w >= state.h, mid = 0;
    open.forEach(function (p) { mid += wide ? p.j : p.i; });
    mid /= open.length;
    var pick = function (sign) {
      var best = null, bs = Infinity;
      open.forEach(function (p) {
        var s = sign * (wide ? p.i : p.j) + 0.6 * Math.abs((wide ? p.j : p.i) - mid);
        if (s < bs) { bs = s; best = p; }
      });
      return best;
    };
    var west = pick(1), east = pick(-1), out = [], taken = {};
    state.ents.forEach(function (e) { taken[Math.floor(e.x) + ',' + Math.floor(e.y)] = 1; });
    [{ type: 'imperial', from: west, to: east }, { type: 'rebel', from: east, to: west }].forEach(function (t) {
      if (state.ents.some(function (e) { return e.type === t.type; })) return;
      var angle = Math.round(Math.atan2(-(t.to.j - t.from.j), t.to.i - t.from.i) * 180 / Math.PI / 45) * 45;
      var queue = [t.from], seen = {}, n = 0;
      seen[t.from.i + ',' + t.from.j] = 1;
      while (queue.length && n < 4) {
        var q = queue.shift(), k = q.i + ',' + q.j;
        if (!taken[k]) { taken[k] = 1; n++; out.push({ type: t.type, x: q.i + 0.5, y: q.j + 0.5, angle: (angle + 360) % 360 }); }
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var i = q.i + d[0], j = q.j + d[1], c = cellAt(state, i, j);
          if (c && !seen[i + ',' + j] && c.c - c.f >= 96) { seen[i + ',' + j] = 1; queue.push({ i: i, j: j }); }
        });
      }
    });
    return out;
  }

  function blankMap(w, h) {
    w = w || 40; h = h || 28;
    return { name: 'mb2_newmap', title: 'New Map', cell: 64, w: w, h: h, cells: new Array(w * h).fill(null), ents: [] };
  }
  // The example level every new visitor starts with: two team hangars around a courtyard.
  function sampleMap() {
    var s = blankMap(40, 28); s.name = 'mb2_twinhangars'; s.title = 'Twin Hangars';
    function room(x, y, w, h, f, c, t, sky) { for (var j = y; j < y + h; j++) for (var i = x; i < x + w; i++) s.cells[j * s.w + i] = { f: f, c: c, t: t, sky: !!sky }; }
    room(2, 8, 9, 12, 0, 320, 'imperial');
    room(29, 8, 9, 12, 0, 320, 'rebel');
    room(11, 12, 4, 4, 0, 192, 'imperial');
    room(25, 12, 4, 4, 0, 192, 'rebel');
    room(15, 6, 10, 16, 0, 512, 'desert', true);
    room(18, 11, 4, 6, 48, 512, 'desert', true);
    room(17, 2, 6, 4, 32, 224, 'temple');
    room(19, 22, 2, 3, 0, 192, 'rebel');
    room(16, 25, 8, 2, 0, 192, 'rebel');
    [[4, 10], [4, 13], [4, 16], [7, 11], [7, 15]].forEach(function (p) { s.ents.push({ type: 'imperial', x: p[0] + .5, y: p[1] + .5, angle: 0 }); });
    [[35, 10], [35, 13], [35, 16], [32, 11], [32, 15]].forEach(function (p) { s.ents.push({ type: 'rebel', x: p[0] + .5, y: p[1] + .5, angle: 180 }); });
    return s;
  }

  var api = {
    blankMap: blankMap, sampleMap: sampleMap, autoSpawns: autoSpawns,
    THEMES: THEMES, SKY: SKY, CAULK: CAULK, ENTITIES: ENTITIES, TEAM_SPAWNS: TEAM_SPAWNS,
    themeById: themeById, cellAt: cellAt, mergeRects: mergeRects, bounds: bounds, wallTheme: wallTheme,
    worldX: worldX, worldY: worldY, toCell: toCell, brushList: brushList, brushBox: brushBox, buildBrushes: buildBrushes,
    extraSpawns: extraSpawns, autoLights: autoLights, origin: origin, entityList: entityList, entityString: entityString,
    generateMap: generateMap, generateArena: generateArena, generateSiege: generateSiege, check: check, slug: slug
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapGen = api;
})(this);
