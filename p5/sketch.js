// ====== GLOBALS ======
let svgText;
let shapePts = [];
let uSamples = [];
let segVecs = [];
let totalLen = 0;

let currentIndex = 0;
let stepsPerFrame = 400;  // speed of animated drawing
let N = 140000;           // total samples along the final curve

let shapeReady = false;

// base pattern parameters
let circleR = 150;   // outer circle radius (px)
let shapeScale = 250; // size of your SVG shape (px)
let repeats = 71;     // how many times shape repeats around the circle
let rotMult = 1;     // base rotation of shapes around circle

// breathing toggles (UI)
let cbShapeBreath, cbCircleBreath, cbRotBreath, cbColorBreath, cbEase, cbAudioReactive;

// audio (optional, needs p5.sound)
let mic, amp;
let audioButton;

// breathing state (updated each frame)
let circleRNow, shapeScaleNow, rotNow, hueNow;

function preload() {
  // IMPORTANT: in p5 web editor, put shape.svg into "assets/" folder
  svgText = loadStrings("RaceCircuitAutodromaDiMonza.svg");
}

function setup() {
  let sz = min(windowWidth - 40, windowHeight - 120, 900);
  createCanvas(sz, sz);

  // scale radii proportionally to canvas size
  let scaleFactor = sz / 900;
  circleR     = 150 * scaleFactor;
  shapeScale  = 250 * scaleFactor;

  background(0);
  stroke(255);
  strokeWeight(0.35);
  noFill();

  colorMode(HSB, 360, 100, 100, 100);

  // --- SVG -> path points ---
  let svgHTML = svgText.join("\n");
  let holder = createDiv(svgHTML);
  holder.hide();

  let pathEl = holder.elt.querySelector("path");
  if (!pathEl) {
    console.error("No <path> found in SVG!");
    return;
  }

  extractPointsFromPath(pathEl, 1500);
  normalizeShapeToUnit();
  buildArcLengthData();
  shapeReady = true;

  // --- UI controls ---
  let y0 = 10;
  cbShapeBreath   = createCheckbox('Shape scale breath', false).position(10, y0);
  cbCircleBreath  = createCheckbox('Circle radius breath', false).position(10, y0 + 20);
  cbRotBreath     = createCheckbox('Rotation breath', false).position(10, y0 + 40);
  cbColorBreath   = createCheckbox('Color breath', false).position(10, y0 + 60);
  cbEase          = createCheckbox('Eased breathing curve', false).position(10, y0 + 80);
  cbAudioReactive = createCheckbox('Audio reactive (needs mic)', false).position(10, y0 + 100);

  cbShapeBreath.style('color', 'white');
  cbCircleBreath.style('color', 'white');
  cbRotBreath.style('color', 'white');
  cbColorBreath.style('color', 'white');
  cbEase.style('color', 'white');
  cbAudioReactive.style('color', 'white');

  audioButton = createButton('Init audio');
  audioButton.position(10, y0 + 130);
  audioButton.mousePressed(initAudio);
  audioButton.style('color', 'white');


  background(0);
}

// optional audio init (requires p5.sound library in your project)
function initAudio() {
  if (!mic) {
    userStartAudio().then(() => {
      mic = new p5.AudioIn();
      mic.start(() => {
        amp = new p5.Amplitude();
        amp.setInput(mic);
      });
    });
  }
}

function draw() {
  if (!shapeReady) {
    background(0);
    noStroke();
    fill(0, 0, 100);
    textAlign(CENTER, CENTER);
    text("Loading SVG / building shape...", width/2, height/2);
    return;
  }

  // --- breathing & time ---
  let t = millis() * 0.001;  // seconds-ish

  // base values
  circleRNow = circleR;
  shapeScaleNow = shapeScale;
  rotNow = rotMult;
  hueNow = 0;

  // small general helpers
  const easeInOut = x => 0.5 - 0.5 * cos(PI * x); // 0..1 -> 0..1
  const sin01 = (phase, freq=1) => (sin(TWO_PI * freq * t + phase) + 1) * 0.5; // 0..1

  // choose whether to ease the breathing wave
  let shapePhase = 0.0;
  let circlePhase = 1.7;
  let rotPhase = 3.1;
  let colorPhase = 0.9;

  // shape breathing
  if (cbShapeBreath.checked()) {
    let x = sin01(shapePhase, 0.12);   // 0.12 Hz ≈ 8s cycles
    if (cbEase.checked()) x = easeInOut(x);
    let amount = 0.12; // +/-12%
    let f = 1.0 + amount * (x * 2 - 1); // 0..1 -> -1..1
    shapeScaleNow = shapeScale * f;
  }

  // circle radius breathing
  if (cbCircleBreath.checked()) {
    let x = sin01(circlePhase, 0.08);  // slower
    if (cbEase.checked()) x = easeInOut(x);
    let amount = 0.06; // +/-6%
    let f = 1.0 + amount * (x * 2 - 1);
    circleRNow = circleR * f;
  }

  // rotation breathing
  if (cbRotBreath.checked()) {
    let x = sin01(rotPhase, 0.18);
    if (cbEase.checked()) x = easeInOut(x);
    let amount = 0.35;  // +/-35%
    let f = 1.0 + amount * (x * 2 - 1);
    rotNow = rotMult * f;
  }

  // audio-reactive boost on shape scale
  if (cbAudioReactive.checked() && amp) {
    let level = amp.getLevel();      // 0.. ~0.3
    let boost = map(level, 0, 0.3, 1.0, 1.5, true); // up to +50% on loud audio
    shapeScaleNow *= boost;
  }

  // color breathing (HSB hue shift)
  if (cbColorBreath.checked()) {
    let x = sin01(colorPhase, 0.05);
    let baseHue = 210;   // blue-ish
    let span = 120;      // +-60 around base
    hueNow = baseHue + (x - 0.5) * span;
  } else {
    hueNow = 0; // white (we'll set sat=0)
  }

  // --- draw more of the curve ---
  translate(width/2, height/2);

  for (let k = 0; k < stepsPerFrame; k++) {
    if (currentIndex >= N - 1) {
      // fade old drawing a bit and restart
      noStroke();
      fill(0, 0, 0, 18); // transparent black, slight fade
      rect(-width/2, -height/2, width, height);

      currentIndex = 0;
      break;
    }

    let t1 = currentIndex      / (N - 1);
    let t2 = (currentIndex + 1)/ (N - 1);

    let p1 = pointOnPattern(t1, circleRNow, shapeScaleNow, rotNow);
    let p2 = pointOnPattern(t2, circleRNow, shapeScaleNow, rotNow);

    // set stroke color based on color breathing toggle
    if (cbColorBreath.checked()) {
      stroke(hueNow, 70, 100, 90);
    } else {
      stroke(0, 0, 100, 90);  // white
    }
    strokeWeight(0.35);

    line(p1.x, p1.y, p2.x, p2.y);

    currentIndex++;
  }
}

// ================== SVG SAMPLING ==================

function extractPointsFromPath(pathEl, samples) {
  const length = pathEl.getTotalLength();
  shapePts = [];

  for (let i = 0; i < samples; i++) {
    let p = pathEl.getPointAtLength((i / samples) * length);
    shapePts.push(createVector(p.x, p.y));
  }
}

// Center shape at origin & scale so max radius ≈ 1
function normalizeShapeToUnit() {
  if (shapePts.length === 0) return;

  let cx = 0, cy = 0;
  for (let p of shapePts) { cx += p.x; cy += p.y; }
  cx /= shapePts.length;
  cy /= shapePts.length;

  for (let p of shapePts) { p.x -= cx; p.y -= cy; }

  let maxR = 0;
  for (let p of shapePts) {
    let r = sqrt(p.x*p.x + p.y*p.y);
    if (r > maxR) maxR = r;
  }
  let s = 1.0 / maxR;

  // ✅ scale BOTH x and y
  for (let p of shapePts) {
    p.x *= s;
    p.y *= s;
  }

  if (!shapePts[0].equals(shapePts[shapePts.length - 1])) {
    shapePts.push(shapePts[0].copy());
  }
}


function buildArcLengthData() {
  segVecs = [];
  let s = [0];
  for (let i = 0; i < shapePts.length - 1; i++) {
    let v = p5.Vector.sub(shapePts[i+1], shapePts[i]);
    segVecs.push(v);
    s.push(s[s.length-1] + v.mag());
  }
  totalLen = s[s.length - 1];
  uSamples = s.map(val => val / totalLen);
}

// ================== PATTERN MATH ==================

// Circle as outer path, SVG shape repeated around it
function pointOnPattern(t, circleRVal, shapeScaleVal, rotVal) {
  // base circle
  let angle = TWO_PI * t;
  let cx = circleRVal * cos(angle);
  let cy = circleRVal * sin(angle);

  // position along the shape
  let u = (repeats * t) % 1.0;
  let s = sampleShape(u);  // unit shape space

  // rotation of shape
  let rot = rotVal * TWO_PI * t;
  let rx = s.x * cos(rot) - s.y * sin(rot);
  let ry = s.x * sin(rot) + s.y * cos(rot);

  return createVector(
    cx + shapeScaleVal * rx,
    cy + shapeScaleVal * ry
  );
}

function sampleShape(u) {
  u = ((u % 1) + 1) % 1;   // [0,1)
  let i = 0;
  while (i < uSamples.length - 1 && uSamples[i+1] < u) i++;
  i = constrain(i, 0, segVecs.length - 1);
  let t0 = uSamples[i];
  let t1 = uSamples[i+1];
  let alpha = (t1 === t0) ? 0 : (u - t0) / (t1 - t0);
  let base = shapePts[i];
  let v = segVecs[i];
  return createVector(base.x + alpha * v.x, base.y + alpha * v.y);
}
