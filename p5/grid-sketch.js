// Instance-mode p5 sketch factory — no UI controls, designed for grid display.
// Usage: new p5(makeSpirographSketch(containerEl, svgUrl), containerEl)

// ── SVG path flattening ─────────────────────────────────────────────────
// Browser getPointAtLength() is extremely slow on long paths (~150µs per call,
// seconds of main-thread time for the whole grid), so we flatten the path
// ourselves. Supports M L H V C S Q T A Z, absolute and relative.
function flattenSvgPath(d) {
  const num = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;
  const cmdRe = /[MmLlHhVvCcSsQqTtAaZz]/;
  let i = 0;
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0;     // current point, subpath start
  let lastCtrlX = 0, lastCtrlY = 0, lastCmd = '';

  const skipSep = () => { while (i < d.length && (d[i] === ' ' || d[i] === ',' || d[i] === '\n' || d[i] === '\t' || d[i] === '\r')) i++; };
  const readNum = () => { skipSep(); num.lastIndex = i; const m = num.exec(d); if (!m) throw new Error('bad path number at ' + i); i = num.lastIndex; return parseFloat(m[0]); };
  const readFlag = () => { skipSep(); const c = d[i++]; if (c !== '0' && c !== '1') throw new Error('bad arc flag at ' + i); return c === '1'; };

  const push = (px, py) => pts.push([px, py]);

  function cubic(x0, y0, x1, y1, x2, y2, x3, y3) {
    const n = 24;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      push(u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3,
           u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3);
    }
  }
  function quad(x0, y0, x1, y1, x2, y2) {
    const n = 16;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      push(u*u*x0 + 2*u*t*x1 + t*t*x2, u*u*y0 + 2*u*t*y1 + t*t*y2);
    }
  }
  function arc(x0, y0, rx, ry, phiDeg, large, sweep, x1, y1) {
    if (rx === 0 || ry === 0 || (x0 === x1 && y0 === y1)) { push(x1, y1); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2;
    const x1p =  cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = (x1p*x1p) / (rx*rx) + (y1p*y1p) / (ry*ry);
    if (lam > 1) { const sl = Math.sqrt(lam); rx *= sl; ry *= sl; }
    const num2 = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p;
    const den  = rx*rx*y1p*y1p + ry*ry*x1p*x1p;
    let co = Math.sqrt(Math.max(0, num2 / den));
    if (large === sweep) co = -co;
    const cxp = co * (rx * y1p / ry), cyp = co * -(ry * x1p / rx);
    const cx = cp * cxp - sp * cyp + (x0 + x1) / 2;
    const cy = sp * cxp + cp * cyp + (y0 + y1) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dth > 0) dth -= 2 * Math.PI;
    if (sweep && dth < 0) dth += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dth) / (Math.PI / 24)));
    for (let k = 1; k <= n; k++) {
      const th = th1 + dth * k / n, c = Math.cos(th), s = Math.sin(th);
      push(cp * rx * c - sp * ry * s + cx, sp * rx * c + cp * ry * s + cy);
    }
    pts[pts.length - 1] = [x1, y1];
  }

  let cmd = '';
  while (true) {
    skipSep();
    if (i >= d.length) break;
    if (cmdRe.test(d[i])) { cmd = d[i++]; }
    else if (!cmd || cmd === 'Z' || cmd === 'z') throw new Error('bad path data at ' + i);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === 'Z') {
      if (x !== sx || y !== sy) push(sx, sy);
      x = sx; y = sy; lastCmd = 'Z'; continue;
    }
    if (C === 'M') {
      let nx = readNum(), ny = readNum();
      if (rel) { nx += x; ny += y; }
      x = sx = nx; y = sy = ny; push(x, y);
      cmd = rel ? 'l' : 'L';                // implicit lineto for further pairs
      lastCmd = 'M'; continue;
    }
    if (C === 'L') { let nx = readNum(), ny = readNum(); if (rel) { nx += x; ny += y; } push(nx, ny); x = nx; y = ny; }
    else if (C === 'H') { let nx = readNum(); if (rel) nx += x; push(nx, y); x = nx; }
    else if (C === 'V') { let ny = readNum(); if (rel) ny += y; push(x, ny); y = ny; }
    else if (C === 'C') {
      let x1 = readNum(), y1 = readNum(), x2 = readNum(), y2 = readNum(), nx = readNum(), ny = readNum();
      if (rel) { x1 += x; y1 += y; x2 += x; y2 += y; nx += x; ny += y; }
      cubic(x, y, x1, y1, x2, y2, nx, ny); lastCtrlX = x2; lastCtrlY = y2; x = nx; y = ny;
    }
    else if (C === 'S') {
      let x2 = readNum(), y2 = readNum(), nx = readNum(), ny = readNum();
      if (rel) { x2 += x; y2 += y; nx += x; ny += y; }
      const x1 = (lastCmd === 'C' || lastCmd === 'S') ? 2 * x - lastCtrlX : x;
      const y1 = (lastCmd === 'C' || lastCmd === 'S') ? 2 * y - lastCtrlY : y;
      cubic(x, y, x1, y1, x2, y2, nx, ny); lastCtrlX = x2; lastCtrlY = y2; x = nx; y = ny;
    }
    else if (C === 'Q') {
      let x1 = readNum(), y1 = readNum(), nx = readNum(), ny = readNum();
      if (rel) { x1 += x; y1 += y; nx += x; ny += y; }
      quad(x, y, x1, y1, nx, ny); lastCtrlX = x1; lastCtrlY = y1; x = nx; y = ny;
    }
    else if (C === 'T') {
      let nx = readNum(), ny = readNum();
      if (rel) { nx += x; ny += y; }
      const x1 = (lastCmd === 'Q' || lastCmd === 'T') ? 2 * x - lastCtrlX : x;
      const y1 = (lastCmd === 'Q' || lastCmd === 'T') ? 2 * y - lastCtrlY : y;
      quad(x, y, x1, y1, nx, ny); lastCtrlX = x1; lastCtrlY = y1; x = nx; y = ny;
    }
    else if (C === 'A') {
      const rx = readNum(), ry = readNum(), rot = readNum(), large = readFlag(), sweep = readFlag();
      let nx = readNum(), ny = readNum();
      if (rel) { nx += x; ny += y; }
      arc(x, y, rx, ry, rot, large, sweep, nx, ny); x = nx; y = ny;
    }
    lastCmd = C;
  }
  return pts;
}

// Sample `samples` points at equal arc length along the polyline, starting at
// distance 0 and not including the end (same convention as the old
// getPointAtLength(i / samples * length) loop).
function resamplePolyline(pts, samples) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) {
    cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  }
  const total = cum[cum.length - 1];
  const out = [];
  let seg = 1;
  for (let k = 0; k < samples; k++) {
    const target = (k / samples) * total;
    while (seg < cum.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1];
    const a = span === 0 ? 0 : (target - cum[seg - 1]) / span;
    out.push([pts[seg - 1][0] + a * (pts[seg][0] - pts[seg - 1][0]),
              pts[seg - 1][1] + a * (pts[seg][1] - pts[seg - 1][1])]);
  }
  return out;
}

function makeSpirographSketch(container, svgUrl, repeats) {
  return function(p) {
    let svgText;
    let shapePts = [];
    let uSamples  = [];
    let segVecs   = [];
    let totalLen  = 0;

    let currentIndex  = 0;
    let stepsPerFrame = 200;
    let N             = 100000;
    let shapeReady    = false;

    let circleR, shapeScale;
    const rotMult = 1;

    // Fading: once the first revolution is complete, a black veil dims old
    // strokes. The decay rate (per frame) is the slower of
    //   - a base rate (~2.5% per frame: short comet trail for dense patterns), and
    //   - a rate that keeps one full lap of the track (1/repeats of a revolution)
    //     at >= LAP_VISIBLE brightness, so sparse circuits (e.g. one race) are
    //     never mostly faded.
    // Very small per-frame veils round to nothing on an 8-bit canvas, so the veil
    // is applied every `fadeEvery` frames with a proportionally larger alpha.
    const LAP_VISIBLE = 0.35;
    const lapFrames   = (N / Math.max(repeats, 1)) / stepsPerFrame;
    const decay       = Math.min(-Math.log(1 - 0.025), -Math.log(LAP_VISIBLE) / lapFrames);
    const fadeEvery   = Math.max(1, Math.ceil(0.025 / (1 - Math.exp(-decay))));
    const fadeAlpha   = 100 * (1 - Math.exp(-decay * fadeEvery));   // 0-100 (HSB alpha)
    let fadeTick = 0;
    let hasCompletedLoop = false;
    let havePrev = false;
    let prevPt = { x: 0, y: 0 };
    let nextPt = { x: 0, y: 0 };

    let singleScale;
    function applyScale(sz) {
      let scale = sz / 900;
      circleR    = 150 * scale;
      shapeScale = 250 * scale;
      singleScale = 400 * scale;   // only used when the track is drawn once
    }

    // ── preload ──────────────────────────────────────────────────────────
    p.preload = function() {
      svgText = p.loadStrings(svgUrl);
    };

    // ── setup ────────────────────────────────────────────────────────────
    p.setup = function() {
      if (repeats === 0) { p.noCanvas(); p.noLoop(); return; }
      let sz = container.offsetWidth;
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.createCanvas(sz, sz);
      applyScale(sz);

      p.background(0);
      p.noFill();
      p.colorMode(p.HSB, 360, 100, 100, 100);

      // pull the first <path d="…"> out of the SVG text (no DOM measuring)
      const m = /<path\b[^>]*?\sd="([^"]+)"/.exec(svgText.join('\n'));
      if (!m) { console.error('No <path> in SVG', svgUrl); return; }

      extractPointsFromPath(m[1], 1500);
      normalizeShapeToUnit();
      buildArcLengthData();
      shapeReady = true;
    };

    // ── draw ─────────────────────────────────────────────────────────────
    p.draw = function() {
      if (repeats === 0) return;
      if (!shapeReady) {
        p.background(0);
        p.noStroke();
        p.fill(0, 0, 80);
        p.textAlign(p.CENTER, p.CENTER);
        p.text('Loading…', p.width / 2, p.height / 2);
        return;
      }

      p.translate(p.width / 2, p.height / 2);

      // Once the pen has gone all the way round, keep dimming old strokes
      // so the newest part of the pattern stays readable.
      if (hasCompletedLoop && (++fadeTick % fadeEvery === 0)) {
        p.noStroke();
        p.fill(0, 0, 0, fadeAlpha);
        p.rect(-p.width / 2, -p.height / 2, p.width, p.height);
      }

      p.stroke(0, 0, 100, 90);
      p.strokeWeight(0.35);
      if (!havePrev) { pointOnPattern(currentIndex / (N - 1), prevPt); havePrev = true; }

      for (let k = 0; k < stepsPerFrame; k++) {
        if (currentIndex >= N - 1) {
          currentIndex = 0;       // wrap without clearing
          hasCompletedLoop = true;
          havePrev = false;
          break;
        }

        pointOnPattern((currentIndex + 1) / (N - 1), nextPt);
        p.line(prevPt.x, prevPt.y, nextPt.x, nextPt.y);
        let tmp = prevPt; prevPt = nextPt; nextPt = tmp;
        currentIndex++;
      }
    };

    // ── resize ───────────────────────────────────────────────────────────
    p.windowResized = function() {
      if (repeats === 0 || !shapeReady) return;
      let sz = container.offsetWidth;
      if (!sz || sz === p.width) return;
      p.resizeCanvas(sz, sz);
      applyScale(sz);
      p.background(0);
      currentIndex = 0;
      hasCompletedLoop = false;
    };

    // ── pattern math ─────────────────────────────────────────────────────
    const sampled = { x: 0, y: 0 };

    function pointOnPattern(t, out) {
      // One race = one pass: draw the outline as-is (no orbit, no rotation),
      // otherwise a single pass gets swept round the circle and distorted.
      if (repeats === 1) {
        sampleShape(t, sampled);
        out.x = singleScale * sampled.x;
        out.y = singleScale * sampled.y;
        return;
      }

      let angle = 2 * Math.PI * t;
      let cx = circleR * Math.cos(angle);
      let cy = circleR * Math.sin(angle);

      let u = (repeats * t) % 1.0;
      sampleShape(u, sampled);

      let rot = rotMult * angle;
      let cr = Math.cos(rot), sr = Math.sin(rot);
      out.x = cx + shapeScale * (sampled.x * cr - sampled.y * sr);
      out.y = cy + shapeScale * (sampled.x * sr + sampled.y * cr);
    }

    function sampleShape(u, out) {
      u = ((u % 1) + 1) % 1;
      // binary search: last i with uSamples[i] <= u (original linear scan stopped at uSamples[i+1] >= u)
      let lo = 0, hi = uSamples.length - 2;
      while (lo < hi) {
        let mid = (lo + hi) >> 1;
        if (uSamples[mid + 1] < u) lo = mid + 1; else hi = mid;
      }
      let i = Math.min(lo, segVecs.length - 1);
      let t0    = uSamples[i];
      let t1    = uSamples[i + 1];
      let alpha = (t1 === t0) ? 0 : (u - t0) / (t1 - t0);
      let base  = shapePts[i];
      let v     = segVecs[i];
      out.x = base.x + alpha * v.x;
      out.y = base.y + alpha * v.y;
    }

    // ── SVG sampling ─────────────────────────────────────────────────────
    function extractPointsFromPath(d, samples) {
      const sampledPts = resamplePolyline(flattenSvgPath(d), samples);
      shapePts = sampledPts.map(([px, py]) => p.createVector(px, py));
    }

    function normalizeShapeToUnit() {
      if (!shapePts.length) return;
      let cx = 0, cy = 0;
      for (let pt of shapePts) { cx += pt.x; cy += pt.y; }
      cx /= shapePts.length; cy /= shapePts.length;
      for (let pt of shapePts) { pt.x -= cx; pt.y -= cy; }

      let maxR = 0;
      for (let pt of shapePts) {
        let r = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
        if (r > maxR) maxR = r;
      }
      let s = 1.0 / maxR;
      for (let pt of shapePts) { pt.x *= s; pt.y *= s; }

      if (!shapePts[0].equals(shapePts[shapePts.length - 1])) {
        shapePts.push(shapePts[0].copy());
      }
    }

    function buildArcLengthData() {
      segVecs = [];
      let s = [0];
      for (let i = 0; i < shapePts.length - 1; i++) {
        let v = p5.Vector.sub(shapePts[i + 1], shapePts[i]);
        segVecs.push(v);
        s.push(s[s.length - 1] + v.mag());
      }
      totalLen  = s[s.length - 1];
      uSamples  = s.map(val => val / totalLen);
    }
  };
}
