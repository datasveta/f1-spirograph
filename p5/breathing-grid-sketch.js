// Dynamic ("breathing") spirograph — instance-mode p5 sketch factory.
// Needs grid-sketch.js loaded first (reuses flattenSvgPath / resamplePolyline).
//
// Usage:
//   const state = breathDefaults();                       // live settings, mutate freely
//   new p5(makeBreathingSketch(container, svgUrl, repeats, state, { detail: false }), container)
//
// One shared breath (0 = collapsed to a single track outline, 1 = fully
// unwrapped) drives scale, circle radius, rotation, unwrap and colour. The clock
// is global (performance.now), so every sketch on the page breathes in sync.

const BREATH_PRESETS = {
  minimalist: { shapeScale: 180, circleR: 180, rotMult: 0.4 },
  rosette:    { shapeScale: 220, circleR: 160, rotMult: 1.2 },
  ribbon:     { shapeScale: 260, circleR: 150, rotMult: 0.7 },
  chaotic:    { shapeScale: 300, circleR: 140, rotMult: 2.5 },
  mandala:    { shapeScale: 240, circleR: 170, rotMult: 1.8 },
};

const BREATH_DEFAULTS = Object.freeze({
  shapeBreath: true,
  circleBreath: true,
  rotBreath: true,
  unwrapBreath: true,
  colorBreath: false,
  drift: false,        // slow rotation/scale wander; never touches repeats
  preset: 'ribbon',
  shapeScale: 260,
  circleR: 150,
  rotMult: 0.7,
  unwrap: 1,
  period: 10,          // seconds per full breath
});

function breathDefaults() { return Object.assign({}, BREATH_DEFAULTS); }

// 0 = fully exhaled / collapsed, 1 = fully inhaled / unwrapped. A plain
// cosine: it slows naturally at both ends, with no artificial hold.
function breathValue(sec, period) {
  const x = ((sec / period) % 1 + 1) % 1;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
}

function makeBreathingSketch(container, svgUrl, repeats, userState, opts) {
  const S = userState || breathDefaults();
  const detail = !!(opts && opts.detail);
  const TABLE_N = 2048;
  const TWO_PI = Math.PI * 2;

  return function (p) {
    let svgText;
    let motifX, motifY;           // uniform-in-arc-length table, length TABLE_N + 1
    let ready = false;
    let size = 0;
    let steps = 0, cosA, sinA;    // vertices per frame + precomputed orbit angles
    let ro = null;

    p.preload = function () { svgText = p.loadStrings(svgUrl); };

    p.setup = function () {
      if (repeats === 0) { p.noCanvas(); p.noLoop(); return; }

      const sz = container.offsetWidth || 300;
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, detail ? 2 : 1.5));
      p.createCanvas(sz, sz);
      p.frameRate(detail ? 60 : 30);
      p.colorMode(p.HSB, 360, 100, 100, 100);
      p.noFill();
      p.strokeWeight(0.35);
      applySize(sz);

      const m = /<path\b[^>]*?\sd="([^"]+)"/.exec(svgText.join('\n'));
      if (!m) { console.error('No <path> in SVG', svgUrl); return; }
      buildMotif(m[1]);
      ready = true;

      // Resize with the container (window resize, rotation, panel collapse).
      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => {
          const w = container.offsetWidth;
          if (!w || w === size) return;
          p.resizeCanvas(w, w);
          applySize(w);
          p.redraw();
        });
        ro.observe(container);
      }
      // p5's remove() doesn't tell us; stop observing when the sketch is removed.
      const origRemove = p.remove.bind(p);
      p.remove = function () { if (ro) ro.disconnect(); origRemove(); };
    };

    function applySize(sz) {
      size = sz;
      const perRep = detail ? 200 : 120;
      const lo = detail ? 5000 : 3000;
      const hi = detail ? 30000 : 14000;
      let n = repeats === 1 ? 1500 : Math.min(hi, Math.max(lo, repeats * perRep));
      n = Math.round(n * Math.min(1, Math.max(0.5, sz / 400)));
      steps = n;
      cosA = new Float32Array(n);
      sinA = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = TWO_PI * i / (n - 1);
        cosA[i] = Math.cos(a);
        sinA[i] = Math.sin(a);
      }
    }

    function buildMotif(d) {
      const pts = resamplePolyline(flattenSvgPath(d), TABLE_N);
      let cx = 0, cy = 0;
      for (const q of pts) { cx += q[0]; cy += q[1]; }
      cx /= pts.length; cy /= pts.length;
      let maxR = 0;
      for (const q of pts) { q[0] -= cx; q[1] -= cy; maxR = Math.max(maxR, Math.hypot(q[0], q[1])); }
      motifX = new Float32Array(TABLE_N + 1);
      motifY = new Float32Array(TABLE_N + 1);
      for (let i = 0; i < TABLE_N; i++) { motifX[i] = pts[i][0] / maxR; motifY[i] = pts[i][1] / maxR; }
      motifX[TABLE_N] = motifX[0];    // close the loop
      motifY[TABLE_N] = motifY[0];
    }

    p.draw = function () {
      if (repeats === 0 || !ready) return;

      const t = performance.now() / 1000;
      const b = breathValue(t, S.period);
      const k = b * 2 - 1;                     // -1 .. 1
      const outline = repeats === 1;           // a single pass is just drawn as-is

      // ── this frame's parameters (900 px reference units) ──
      let rScale = S.shapeScale, rCircle = S.circleR, rRot = S.rotMult;
      if (S.drift) {
        rRot += 0.05 * Math.sin(t * 0.1);
        rScale *= 1 + 0.03 * Math.sin(t * 0.05 + 2);
      }
      if (S.shapeBreath && !outline) rScale *= 1 + 0.25 * k;
      if (S.circleBreath) rCircle *= 1 + 0.12 * k;
      if (S.rotBreath) rRot += 0.6 * k;

      // u = 0 → exactly the single-race outline, u = 1 → full pattern.
      const u = outline ? 0 : S.unwrap * (S.unwrapBreath ? b : 1);
      const single = 400 * (outline && S.shapeBreath ? 1 + 0.1 * k : 1);
      const scaleU = single + (rScale - single) * u;
      const radiusU = rCircle * u;
      const rotU = rRot * u;
      const repNow = 1 + (repeats - 1) * u;

      // Keep the whole figure inside the canvas at the peak of the breath.
      const extent = radiusU + scaleU;
      const F = (size / 900) * Math.min(1, 441 / extent);
      const sc = scaleU * F, rad = radiusU * F;

      p.background(0);
      p.translate(p.width / 2, p.height / 2);
      if (S.colorBreath) p.stroke(180 + 100 * b, 70, 100, 90); else p.stroke(0, 0, 100, 90);

      const inv = 1 / (steps - 1);
      p.beginShape();
      for (let i = 0; i < steps; i++) {
        const tt = i * inv;
        let uu = repNow * tt; uu -= Math.floor(uu);
        const fi = uu * TABLE_N, j = fi | 0, a = fi - j;
        const mx = motifX[j] + a * (motifX[j + 1] - motifX[j]);
        const my = motifY[j] + a * (motifY[j + 1] - motifY[j]);
        const rot = rotU * TWO_PI * tt;
        const c = Math.cos(rot), s = Math.sin(rot);
        p.vertex(rad * cosA[i] + sc * (mx * c - my * s),
                 rad * sinA[i] + sc * (mx * s + my * c));
      }
      p.endShape();
    };
  };
}
