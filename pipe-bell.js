/**
 * pipe-bell.js: like pipe.js's plain tube, but flared -- draws a
 * schematic cylinder-then-bell outline and animates the *real* standing
 * wave shape for each partial, computed by horn-equation.js rather than
 * assumed to be a plain sine. The point isn't a literal trombone bore
 * measurement (see the README's references for that); it's showing that
 * the flare visibly reshapes each mode -- compressed loops near the
 * narrow throat, a stretched-out one near the open bell -- not just
 * restoring missing harmonics in the abstract.
 *
 * Played pitch is intentionally NOT tied to this module's own computed
 * frequencies (see horn-equation.js's docstring) -- setHarmonic(n) only
 * selects which precomputed mode SHAPE to animate.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./horn-equation.js"));
  } else {
    root.PipeBell = factory(root.HornEquation);
  }
})(typeof self !== "undefined" ? self : this, function (HornEquation) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function makeBellPipe(container, opts) {
    opts = opts || {};
    var width = opts.width || 800;
    var height = opts.height || 160;
    var margin = opts.margin || 20;
    var maxModes = opts.maxModes || 8;
    var speed = opts.speed || 2.2;

    var profile = HornEquation.compoundBellProfile({
      flareStart: opts.flareStart != null ? opts.flareStart : 0.5,
      bellRatio: opts.bellRatio || 8,
      power: opts.power || 2
    });
    var modeK = HornEquation.findModes(profile.logAreaSlope, { maxModes: maxModes });
    var POINTS = 140;
    var shapes = modeK.map(function (k) {
      var samples = HornEquation.modeShape(profile.logAreaSlope, k, { points: POINTS });
      var peak = Math.max.apply(null, samples.map(function (s) { return Math.abs(s.p); }));
      return samples.map(function (s) { return s.p / peak; }); // normalized to [-1, 1]
    });

    var svg = el("svg", {
      width: "100%", viewBox: "0 0 " + width + " " + height,
      preserveAspectRatio: "xMidYMid meet", class: "pipe-svg"
    });
    container.appendChild(svg);

    var midY = height / 2;
    var left = margin;
    var right = width - margin;
    var maxRadiusPx = height / 2 - margin;
    var drawScale = maxRadiusPx / profile.radius(profile.length); // bell mouth just fits

    function toPx(fracX) { return left + fracX * (right - left); }

    // Pressure is longitudinal (air moves along the tube's own axis, not
    // across it) -- a squiggly line drawn crosswise, however standard as
    // a teaching picture, is a graph laid over the tube, not a picture of
    // anything actually happening inside it. Painting the true interior
    // with color -- warm for compression, cool for rarefaction, dark at a
    // node -- reads as what's physically there instead, and it can never
    // visually escape the walls, since it's bounded by them by construction.
    function pressureColor(v) {
      var neutral = [26, 22, 14];
      var hot = [255, 59, 48];   // compression
      var cold = [56, 189, 248]; // rarefaction
      var t = Math.min(1, Math.abs(v));
      var target = v >= 0 ? hot : cold;
      var rgb = neutral.map(function (c, i) { return Math.round(c + (target[i] - c) * t); });
      return "rgb(" + rgb.join(",") + ")";
    }

    // One band per sample interval, its height following the tube's own
    // local radius -- geometry is fixed at construction; only each
    // band's fill color changes per animation frame.
    var bands = [];
    for (var i = 0; i < POINTS; i++) {
      var fracL = i / POINTS, fracR = (i + 1) / POINTS;
      var xL = toPx(fracL), xR = toPx(fracR);
      var r = profile.radius(((fracL + fracR) / 2) * profile.length) * drawScale;
      var rect = el("rect", { x: xL, y: midY - r, width: (xR - xL) + 0.5, height: r * 2, fill: pressureColor(0) });
      svg.appendChild(rect);
      bands.push(rect);
    }

    // Tube walls drawn on top of the color fill, sampled outline
    // following radius(x), mirrored top/bottom.
    var wallStrokeWidth = opts.wallStrokeWidth || 6;
    var topD = "", bottomD = "";
    for (var j = 0; j <= POINTS; j++) {
      var frac = j / POINTS;
      var x = toPx(frac);
      var rr = profile.radius(frac * profile.length) * drawScale;
      topD += (j === 0 ? "M " : "L ") + x + " " + (midY - rr) + " ";
      bottomD += (j === 0 ? "M " : "L ") + x + " " + (midY + rr) + " ";
    }
    // The same simplified squiggle the plain tube uses, overlaid here
    // too for a direct side-by-side comparison -- scaled to the tube's
    // own local radius at each x (not one fixed amplitude) so it stays
    // inside the walls everywhere, tapering with the bore instead of
    // overflowing the narrow throat the way a bell-width-scaled
    // amplitude would.
    var wave = el("path", { fill: "none", stroke: "#2ecc71", "stroke-width": 2.5 });
    svg.appendChild(wave);

    svg.appendChild(el("path", { d: topD, fill: "none", stroke: "var(--brass-dim)", "stroke-width": wallStrokeWidth }));
    svg.appendChild(el("path", { d: bottomD, fill: "none", stroke: "var(--brass-dim)", "stroke-width": wallStrokeWidth }));

    var harmonic = null;
    var phase = 0;
    var lastT = null;

    function frame(t) {
      if (lastT === null) lastT = t;
      var dt = (t - lastT) / 1000;
      lastT = t;
      var shape = harmonic ? shapes[harmonic - 1] : null;
      if (shape) phase += speed * (modeK[harmonic - 1] / modeK[0]) * dt;

      var d = "";
      for (var b = 0; b < bands.length; b++) {
        var envelope = shape ? (shape[b] + shape[b + 1]) / 2 : 0;
        bands[b].setAttribute("fill", pressureColor(envelope * Math.cos(phase)));

        var frac = (b + 0.5) / POINTS;
        var x = toPx(frac);
        var localAmplitude = profile.radius(frac * profile.length) * drawScale * 0.7;
        var y = midY - envelope * localAmplitude * Math.cos(phase);
        d += (b === 0 ? "M " : "L ") + x + " " + y + " ";
      }
      wave.setAttribute("d", d);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    function setHarmonic(n) {
      harmonic = n;
    }

    return { setHarmonic: setHarmonic };
  }

  return { makeBellPipe: makeBellPipe };
});
