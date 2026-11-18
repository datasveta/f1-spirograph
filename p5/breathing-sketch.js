// =====================================================================
// F1 spirograph – BREATHING version
// Geometry: a circle of radius circleR, with the circuit outline
// repeated `repeats` times around it and rotated by rotMult turns.
//
// Breathing: ONE shared breath phase (0..1) drives every parameter, so
// the whole figure inhales/exhales together instead of drifting apart.
// =====================================================================

const SVG_FILE = "RaceCircuitAutodromaDiMonza.svg";
const CURVE_STEPS = 20000;   // vertices per frame
const TABLE_N = 2048;        // motif lookup resolution

// ---- motif lookup (uniform in arc length, O(1) sampling) ----
let svgText;
let motifX, motifY;          // Float32Array(TABLE_N + 1)
let shapeReady = false;

// ---- base parameters (set by presets / sliders) ----
let circleR = 150, shapeScale = 250, repeats = 71, rotMult = 1;

// ---- UI ----
let styleSelect;
let repeatsSlider, shapeScaleSlider, circleRSlider, rotSlider, unwrapSlider, periodSlider;
let cbShape, cbCircle, cbRot, cbColor, cbUnwrap, cbEase, cbDrift, cbAudio;
let audioButton;

// ---- audio ----
let mic, amp;

const PRESETS = {
  minimalist: { repeats: 40,  shapeScale: 180, circleR: 180, rotMult: 0.4 },
  rosette:    { repeats: 60,  shapeScale: 220, circleR: 160, rotMult: 1.2 },
  ribbon:     { repeats: 80,  shapeScale: 260, circleR: 150, rotMult: 0.7 },
  chaotic:    { repeats: 120, shapeScale: 300, circleR: 140, rotMult: 2.5 },
  mandala:    { repeats: 150, shapeScale: 240, circleR: 170, rotMult: 1.8 },
};

// reused every vertex – no per-point allocation
const _pt = { x: 0, y: 0 };

function preload() {
  svgText = loadStrings(SVG_FILE);
}

function setup() {
  createCanvas(900, 900);
  colorMode(HSB, 360, 100, 100, 100);

  buildMotifFromSvg(svgText.join("\n"));
  shapeReady = true;

  buildUI();
}

// =====================================================================
// SVG -> uniform lookup table
// =====================================================================
function buildMotifFromSvg(svgString) {
  // Parse the string, then measure the path inside a *rendered but
  // invisible* <svg>. (display:none, which p5's .hide() uses, makes
  // getTotalLength()/getPointAtLength() fail in some browsers.)
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const src = doc.querySelector("path");
  if (!src) throw new Error("No <path> found in " + SVG_FILE);

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", src.getAttribute("d"));
  svg.appendChild(path);
  document.body.appendChild(svg);

  const len = path.getTotalLength();
  const N = TABLE_N;
  const xs = new Float32Array(N + 1);
  const ys = new Float32Array(N + 1);

  // Sampling the path at equal arc-length steps already gives a table
  // that is uniform in arc length, so lookup is just index + lerp.
  for (let i = 0; i < N; i++) {
    const p = path.getPointAtLength((i / N) * len);
    xs[i] = p.x;
    ys[i] = p.y;
  }
  svg.remove();

  // centre on the centroid and scale so the farthest point has radius 1
  let cx = 0, cy = 0;
  for (let i = 0; i < N; i++) { cx += xs[i]; cy += ys[i]; }
  cx /= N; cy /= N;
  let maxR = 0;
  for (let i = 0; i < N; i++) {
    xs[i] -= cx; ys[i] -= cy;
    maxR = Math.max(maxR, Math.hypot(xs[i], ys[i]));
  }
  for (let i = 0; i < N; i++) { xs[i] /= maxR; ys[i] /= maxR; }

  xs[N] = xs[0];   // close the loop
  ys[N] = ys[0];
  motifX = xs;
  motifY = ys;
}

function sampleMotif(u, out) {
  u = u - Math.floor(u);              // wrap to [0,1)
  const f = u * TABLE_N;
  const i = f | 0;
  const a = f - i;
  out.x = motifX[i] + a * (motifX[i + 1] - motifX[i]);
  out.y = motifY[i] + a * (motifY[i + 1] - motifY[i]);
}

// =====================================================================
// UI
// =====================================================================
function buildUI() {
  const white = (el) => { el.style("color", "white"); return el; };

  let y = 10;
  const row = 22;
  const checkbox = (label, on = false) => {
    const c = white(createCheckbox(label, on).position(10, y));
    y += row;
    return c;
  };

  cbShape  = checkbox("Shape scale breath", true);
  cbCircle = checkbox("Circle radius breath", true);
  cbRot    = checkbox("Rotation breath", false);
  cbUnwrap = checkbox("Unwrap breath", false);
  cbColor  = checkbox("Color breath", true);
  cbEase   = checkbox("Eased breathing curve", true);
  cbDrift  = checkbox("Slow drift", true);
  cbAudio  = checkbox("Audio reactive (needs mic)", false);

  audioButton = createButton("Init audio").position(10, y);
  audioButton.style("color", "white");
  audioButton.mousePressed(initAudio);
  y += 34;

  styleSelect = createSelect().position(10, y);
  Object.keys(PRESETS).forEach((k) => styleSelect.option(k));
  styleSelect.option("custom");
  styleSelect.selected("rosette");
  styleSelect.style("color", "white");
  styleSelect.style("background", "#222");
  y += 36;

  const slider = (label, min, max, val, step) => {
    white(createSpan(label)).position(10, y).style("font-size", "12px");
    const s = createSlider(min, max, val, step).position(10, y + 16);
    s.style("width", "160px");
    // touching a slider switches to custom so it actually takes effect
    s.input(() => styleSelect.selected("custom"));
    y += 44;
    return s;
  };

  repeatsSlider    = slider("Repeats", 1, 200, repeats, 1);
  shapeScaleSlider = slider("Motif scale", 10, 600, shapeScale, 1);
  circleRSlider    = slider("Circle radius", 10, 400, circleR, 1);
  rotSlider        = slider("Rotation", -4, 4, rotMult, 0.01);

  // unwrap and period are independent of presets
  white(createSpan("Unwrap (0 = bare motif, 1 = full pattern)")).position(10, y).style("font-size", "12px");
  unwrapSlider = createSlider(0, 1, 1, 0.001).position(10, y + 16);
  unwrapSlider.style("width", "160px");
  y += 44;

  white(createSpan("Breath period (seconds)")).position(10, y).style("font-size", "12px");
  periodSlider = createSlider(3, 20, 10, 0.5).position(10, y + 16);
  periodSlider.style("width", "160px");
}

function initAudio() {
  if (mic) return;
  userStartAudio().then(() => {
    mic = new p5.AudioIn();
    mic.start(() => {
      amp = new p5.Amplitude();
      amp.setInput(mic);
    });
  });
}

// =====================================================================
// draw
// =====================================================================
function draw() {
  if (!shapeReady) return;
  background(0);

  // ---- presets / sliders ----
  const style = styleSelect.value();
  if (style !== "custom") {
    const p = PRESETS[style];
    ({ repeats, shapeScale, circleR, rotMult } = p);
    repeatsSlider.value(repeats);
    shapeScaleSlider.value(shapeScale);
    circleRSlider.value(circleR);
    rotSlider.value(rotMult);
  } else {
    repeats = repeatsSlider.value();
    shapeScale = shapeScaleSlider.value();
    circleR = circleRSlider.value();
    rotMult = rotSlider.value();
  }

  // ---- the breath: one phase for everything ----
  // b = 0 fully exhaled, 1 fully inhaled
  const t = millis() / 1000;
  const period = periodSlider.value();
  let b = 0.5 - 0.5 * cos((TWO_PI * t) / period);
  if (cbEase.checked()) b = 0.5 - 0.5 * cos(PI * b);   // lingers at the ends
  const k = b * 2 - 1;                                  // -1..1

  // ---- parameters for this frame ----
  let rNow = circleR;
  let scaleNow = shapeScale;
  let rotNow = rotMult;
  let repNow = repeats;
  let unwrap = unwrapSlider.value();

  if (cbShape.checked())  scaleNow *= 1 + 0.25 * k;
  if (cbCircle.checked()) rNow     *= 1 + 0.12 * k;
  if (cbRot.checked())    rotNow   += 0.6 * k;
  if (cbUnwrap.checked()) unwrap   *= 0.35 + 0.65 * b;

  if (cbDrift.checked()) {
    // slow, bounded offsets (not accumulated, so presets stay stable)
    repNow   += 1.5   * sin(t * 0.07 + 1);
    rotNow   += 0.05  * sin(t * 0.10);
    scaleNow *= 1 + 0.03 * sin(t * 0.05 + 2);
  }

  if (cbAudio.checked() && amp) {
    scaleNow *= map(amp.getLevel(), 0, 0.3, 1, 1.5, true);
  }

  if (cbColor.checked()) stroke(180 + 100 * b, 70, 100, 90);
  else stroke(0, 0, 100, 90);

  // ---- unwrap blend ----
  const rUn = rNow * unwrap;
  const repUn = 1 + (repNow - 1) * unwrap;
  const rotUn = rotNow * unwrap;
  const scaleUn = shapeScale * 0.6 + (scaleNow - shapeScale * 0.6) * unwrap;

  // ---- draw the full curve ----
  translate(width / 2, height / 2);
  strokeWeight(0.35);
  noFill();
  beginShape();
  for (let i = 0; i < CURVE_STEPS; i++) {
    const tt = i / (CURVE_STEPS - 1);
    const ang = TWO_PI * tt;

    sampleMotif(repUn * tt, _pt);

    const rot = rotUn * TWO_PI * tt;
    const c = Math.cos(rot), s = Math.sin(rot);
    const rx = _pt.x * c - _pt.y * s;
    const ry = _pt.x * s + _pt.y * c;

    vertex(rUn * Math.cos(ang) + scaleUn * rx,
           rUn * Math.sin(ang) + scaleUn * ry);
  }
  endShape();
}
