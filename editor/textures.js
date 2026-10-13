// Procedural textures for each look, drawn on canvas. The same canvases feed the 3D preview
// and are saved as JPEGs inside the map's pk3, so the game shows exactly what the editor shows.
(function (root) {
  'use strict';
  var SIZE = 256;

  function rng(seed) { var s = seed % 2147483647 || 1; return function () { return (s = s * 16807 % 2147483647) / 2147483647; }; }

  // Tileable value noise, 0..1.
  function noise(seed, cells) {
    var r = rng(seed), g = [];
    for (var k = 0; k < cells * cells; k++) g.push(r());
    return function (x, y) {
      var fx = x / SIZE * cells, fy = y / SIZE * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      var at = function (i, j) { return g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)]; };
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      return a + (b - a) * ty;
    };
  }
  function fbm(seed) {
    var n = [noise(seed, 4), noise(seed + 7, 8), noise(seed + 13, 16), noise(seed + 29, 32)];
    return function (x, y) { return n[0](x, y) * .45 + n[1](x, y) * .28 + n[2](x, y) * .17 + n[3](x, y) * .1; };
  }

  function canvas() {
    var c = document.createElement('canvas'); c.width = c.height = SIZE;
    return c;
  }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

  // Fill with a base colour modulated by noise.
  function base(ctx, hex, amount, seed) {
    var img = ctx.createImageData(SIZE, SIZE), c = rgb(hex), f = fbm(seed);
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      var k = (y * SIZE + x) * 4, m = 1 + (f(x, y) - .5) * amount;
      img.data[k] = c[0] * m; img.data[k + 1] = c[1] * m; img.data[k + 2] = c[2] * m; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  // Raised panel grid: light top/left edge, dark bottom/right edge.
  function panels(ctx, cols, rows, light, dark, w) {
    var pw = SIZE / cols, ph = SIZE / rows;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var x = i * pw, y = j * ph;
      ctx.fillStyle = dark; ctx.fillRect(x, y + ph - w, pw, w); ctx.fillRect(x + pw - w, y, w, ph);
      ctx.fillStyle = light; ctx.fillRect(x, y, pw, w); ctx.fillRect(x, y, w, ph);
    }
  }
  function rivets(ctx, cols, rows, color, inset) {
    var pw = SIZE / cols, ph = SIZE / rows;
    ctx.fillStyle = color;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      [[inset, inset], [pw - inset, inset], [inset, ph - inset], [pw - inset, ph - inset]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(i * pw + p[0], j * ph + p[1], 2.2, 0, Math.PI * 2); ctx.fill();
      });
    }
  }
  // Running-bond blocks (stone, bricks) with mortar lines.
  function blocks(ctx, rows, cols, mortar, shade, seed) {
    var r = rng(seed), bh = SIZE / rows, bw = SIZE / cols;
    for (var j = 0; j < rows; j++) for (var i = -1; i < cols + 1; i++) {
      var x = i * bw + (j % 2 ? bw / 2 : 0), y = j * bh;
      ctx.fillStyle = 'rgba(' + shade + ',' + (r() * .18).toFixed(3) + ')'; ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = mortar; ctx.fillRect(x, y, bw, 3); ctx.fillRect(x, y, 3, bh);
    }
  }
  function grate(ctx, step, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    for (var k = 0; k < SIZE; k += step) { ctx.beginPath(); ctx.moveTo(k + 1, 0); ctx.lineTo(k + 1, SIZE); ctx.stroke(); }
  }

  var DRAW = {
    imperial_floor: function (x) { base(x, '#4b5057', .5, 11); panels(x, 2, 2, 'rgba(255,255,255,.18)', 'rgba(0,0,0,.45)', 4); rivets(x, 2, 2, 'rgba(0,0,0,.5)', 12); },
    imperial_wall: function (x) {
      base(x, '#8b9299', .35, 12); panels(x, 2, 2, 'rgba(255,255,255,.22)', 'rgba(0,0,0,.35)', 5);
      x.fillStyle = '#20252b'; x.fillRect(0, 116, SIZE, 24); x.fillStyle = 'rgba(190,225,255,.85)'; x.fillRect(0, 124, SIZE, 8);
    },
    imperial_ceil: function (x) { base(x, '#3b4046', .45, 13); grate(x, 16, 'rgba(0,0,0,.4)'); panels(x, 1, 1, 'rgba(255,255,255,.1)', 'rgba(0,0,0,.5)', 6); },
    rebel_floor: function (x) {
      base(x, '#6d6b5c', .6, 21); panels(x, 2, 4, 'rgba(255,255,255,.12)', 'rgba(0,0,0,.4)', 3); rivets(x, 2, 4, 'rgba(0,0,0,.45)', 8);
    },
    rebel_wall: function (x) {
      base(x, '#a39b7e', .45, 22); panels(x, 1, 2, 'rgba(255,255,255,.2)', 'rgba(0,0,0,.35)', 5);
      x.fillStyle = 'rgba(60,55,40,.6)'; [40, 52].forEach(function (y) { x.fillRect(0, y, SIZE, 5); });
    },
    rebel_ceil: function (x) { base(x, '#55503f', .5, 23); grate(x, 32, 'rgba(0,0,0,.35)'); },
    desert_floor: function (x) {
      base(x, '#c9a66b', .35, 31);
      x.strokeStyle = 'rgba(120,85,40,.12)'; x.lineWidth = 3;
      for (var k = 0; k < 8; k++) { x.beginPath(); for (var t = 0; t <= SIZE; t += 8) x.lineTo(t, k * 32 + Math.sin(t / 40 + k) * 6); x.stroke(); }
    },
    desert_wall: function (x) { base(x, '#c8a477', .55, 32); x.fillStyle = 'rgba(90,60,30,.25)'; x.fillRect(0, SIZE - 20, SIZE, 20); },
    desert_ceil: function (x) {
      base(x, '#6b4a2e', .4, 33); x.fillStyle = 'rgba(0,0,0,.35)';
      for (var k = 0; k < SIZE; k += 64) x.fillRect(k, 0, 6, SIZE);
    },
    temple_floor: function (x) { base(x, '#b3a58c', .4, 41); blocks(x, 2, 2, 'rgba(60,50,35,.6)', '255,255,255', 41); },
    temple_wall: function (x) { base(x, '#a8987c', .45, 42); blocks(x, 6, 2, 'rgba(60,50,35,.55)', '0,0,0', 42); },
    temple_ceil: function (x) { base(x, '#7d705c', .4, 43); blocks(x, 2, 2, 'rgba(40,32,22,.6)', '0,0,0', 43); },
    snow_floor: function (x) { base(x, '#dfe7ee', .18, 51); },
    snow_wall: function (x) { base(x, '#a7bccb', .35, 52); panels(x, 2, 1, 'rgba(255,255,255,.35)', 'rgba(20,40,60,.3)', 5); },
    snow_ceil: function (x) { base(x, '#8296a5', .35, 53); grate(x, 32, 'rgba(0,0,0,.25)'); }
  };

  var cache = {};
  function get(name) {
    if (cache[name]) return cache[name];
    var c = canvas(), ctx = c.getContext('2d');
    (DRAW[name] || DRAW.imperial_wall)(ctx);
    return (cache[name] = c);
  }

  // Six sky box faces: blue overhead fading to a pale horizon, soft clouds.
  var SKY_FACES = ['rt', 'bk', 'lf', 'ft', 'up', 'dn'];
  function sky(face) {
    var key = 'sky_' + face;
    if (cache[key]) return cache[key];
    var c = canvas(), x = c.getContext('2d'), img = x.createImageData(SIZE, SIZE), f = fbm(61 + SKY_FACES.indexOf(face));
    var top = [74, 128, 196], hor = [200, 214, 226], ground = [120, 110, 95];
    for (var py = 0; py < SIZE; py++) for (var px = 0; px < SIZE; px++) {
      var t, col;
      if (face === 'up') { t = 0; } else if (face === 'dn') { t = 2; } else { t = py / SIZE * 2; } // 0 = zenith, 1 = horizon, 2 = below
      if (t <= 1) col = top.map(function (v, k) { return v + (hor[k] - v) * Math.pow(t, 1.6); });
      else col = hor.map(function (v, k) { return v + (ground[k] - v) * Math.min(1, (t - 1) * 3); });
      var cloud = t <= 1.02 ? Math.max(0, f(px, py) - .52) * 2.4 * (face === 'up' ? 1 : t) : 0;
      var k = (py * SIZE + px) * 4;
      img.data[k] = col[0] + (255 - col[0]) * cloud; img.data[k + 1] = col[1] + (255 - col[1]) * cloud; img.data[k + 2] = col[2] + (255 - col[2]) * cloud; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return (cache[key] = c);
  }

  function blob(c) {
    return new Promise(function (ok, fail) { c.toBlob(function (b) { b ? ok(b) : fail(new Error('texture failed')); }, 'image/jpeg', 0.88); });
  }

  // Shader script: the sky needs one so the game draws the sky box there.
  var SHADER = [
    'textures/mb2mm/sky', '{', '\tqer_editorimage textures/mb2mm/imperial_wall', '\tsurfaceparm sky', '\tsurfaceparm noimpact',
    '\tsurfaceparm nomarks', '\tsurfaceparm nolightmap', '\tq3map_sun 1 0.95 0.85 120 34 64', '\tskyparms env/mb2mm/sky - -', '}', ''
  ].join('\r\n');

  root.MapTextures = { SIZE: SIZE, names: Object.keys(DRAW), get: get, sky: sky, SKY_FACES: SKY_FACES, blob: blob, SHADER: SHADER };
})(this);
