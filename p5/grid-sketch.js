// Instance-mode p5 sketch factory — no UI controls, designed for grid display.
// Usage: new p5(makeSpirographSketch(containerEl, svgUrl), containerEl)

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

    // ── preload ──────────────────────────────────────────────────────────
    p.preload = function() {
      svgText = p.loadStrings(svgUrl);
    };

    // ── setup ────────────────────────────────────────────────────────────
    p.setup = function() {
      if (repeats === 0) { p.noCanvas(); p.noLoop(); return; }
      let sz = container.offsetWidth;
      p.createCanvas(sz, sz);

      let scale = sz / 900;
      circleR    = 150 * scale;
      shapeScale = 250 * scale;

      p.background(0);
      p.noFill();
      p.colorMode(p.HSB, 360, 100, 100, 100);

      // parse SVG in a hidden div
      let holder = document.createElement('div');
      holder.style.display = 'none';
      holder.innerHTML = svgText.join('\n');
      document.body.appendChild(holder);

      let pathEl = holder.querySelector('path');
      if (!pathEl) { console.error('No <path> in SVG'); return; }

      extractPointsFromPath(pathEl, 1500);
      normalizeShapeToUnit();
      buildArcLengthData();
      document.body.removeChild(holder);
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

      for (let k = 0; k < stepsPerFrame; k++) {
        if (currentIndex >= N - 1) {
          p.noStroke();
          p.fill(0, 0, 0, 18);
          p.rect(-p.width / 2, -p.height / 2, p.width, p.height);
          currentIndex = 0;
          break;
        }

        let t1 = currentIndex       / (N - 1);
        let t2 = (currentIndex + 1) / (N - 1);

        let pt1 = pointOnPattern(t1);
        let pt2 = pointOnPattern(t2);

        p.stroke(0, 0, 100, 90);
        p.strokeWeight(0.35);
        p.line(pt1.x, pt1.y, pt2.x, pt2.y);
        currentIndex++;
      }
    };

    // ── pattern math ─────────────────────────────────────────────────────
    function pointOnPattern(t) {
      let angle = p.TWO_PI * t;
      let cx = circleR * p.cos(angle);
      let cy = circleR * p.sin(angle);

      let u = (repeats * t) % 1.0;
      let s = sampleShape(u);

      let rot = rotMult * p.TWO_PI * t;
      let rx = s.x * p.cos(rot) - s.y * p.sin(rot);
      let ry = s.x * p.sin(rot) + s.y * p.cos(rot);

      return p.createVector(cx + shapeScale * rx, cy + shapeScale * ry);
    }

    function sampleShape(u) {
      u = ((u % 1) + 1) % 1;
      let i = 0;
      while (i < uSamples.length - 1 && uSamples[i + 1] < u) i++;
      i = p.constrain(i, 0, segVecs.length - 1);
      let t0    = uSamples[i];
      let t1    = uSamples[i + 1];
      let alpha = (t1 === t0) ? 0 : (u - t0) / (t1 - t0);
      let base  = shapePts[i];
      let v     = segVecs[i];
      return p.createVector(base.x + alpha * v.x, base.y + alpha * v.y);
    }

    // ── SVG sampling ─────────────────────────────────────────────────────
    function extractPointsFromPath(pathEl, samples) {
      const len = pathEl.getTotalLength();
      shapePts = [];
      for (let i = 0; i < samples; i++) {
        let pt = pathEl.getPointAtLength((i / samples) * len);
        shapePts.push(p.createVector(pt.x, pt.y));
      }
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
