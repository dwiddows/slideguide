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
 * frequencies (see theory.js, which plays MusicTheory's idealized notes
 * instead) -- setHarmonic(n) only selects which precomputed mode SHAPE
 * to animate. setFrequency(label) is the same idea generalized to any
 * partial NUMBER at all, including fractional ones in between --
 * interpolated over the bore's own real (unevenly-spaced) resonance
 * ladder, not a naive multiple of the fundamental, so it agrees exactly
 * with setHarmonic at every integer.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./horn-equation.js"), require("./staff-view.js"));
  } else {
    root.PipeBell = factory(root.HornEquation, root.StaffView);
  }
})(typeof self !== "undefined" ? self : this, function (HornEquation, StaffView) {
  "use strict";

  var el = StaffView.el;

  // Pressure is longitudinal (air moves along the tube's own axis, not
  // across it) -- a squiggly line drawn crosswise, however standard as
  // a teaching picture, is a graph laid over the tube, not a picture of
  // anything actually happening inside it. Painting the true interior
  // reads as what's physically there instead, and it can never visually
  // escape the walls, since it's bounded by them by construction.
  //
  // Grayscale density, not hue: a node sits at a stable mid-gray, since
  // its pressure never actually deviates from ambient, and only
  // antinodes swing toward white (compressed) or black (rarefied). Two
  // things tried and dropped along the way: mapping |pressure| to
  // opacity/brightness against the page background (made nodes fade
  // toward "empty" instead of staying put -- wrong, ambient pressure
  // there is constant); and a sqrt response curve for contrast (its
  // infinite slope at v=0 made every zero-crossing snap rather than
  // ease, reading as jerky) -- a plain linear GAIN does the same "more
  // contrast" job smoothly. The canvas around the horn is also filled
  // with this same neutral gray, so the wall is the only boundary, not
  // a hard cutoff to black as if the room outside were a vacuum.
  var GRAY_NEUTRAL = [130, 130, 130]; // ambient, at rest -- a node stays exactly here
  var GRAY_WHITE = [235, 235, 235];   // compression -- short of pure white
  var GRAY_BLACK = [20, 20, 20];      // rarefaction
  var GRAY_NEUTRAL_CSS = "rgb(" + GRAY_NEUTRAL.join(",") + ")";
  var GAIN = 1.7; // reach full saturation before the theoretical peak |v|=1
  function pressureColor(v) {
    var t = Math.min(1, Math.abs(v) * GAIN);
    var target = v >= 0 ? GRAY_WHITE : GRAY_BLACK;
    var r = Math.round(GRAY_NEUTRAL[0] + (target[0] - GRAY_NEUTRAL[0]) * t);
    var g = Math.round(GRAY_NEUTRAL[1] + (target[1] - GRAY_NEUTRAL[1]) * t);
    var b = Math.round(GRAY_NEUTRAL[2] + (target[2] - GRAY_NEUTRAL[2]) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function normalize(samples) {
    var peak = Math.max.apply(null, samples.map(function (s) { return Math.abs(s.p); }));
    return samples.map(function (s) { return peak > 1e-6 ? s.p / peak : 0; });
  }

  function makeBellPipe(container, opts) {
    opts = opts || {};
    var width = opts.width || 800;
    var height = opts.height || 160;
    var margin = opts.margin || 20;
    var maxModes = opts.maxModes || 8;
    var speed = opts.speed || 2.2;

    // Defaults are a numerical search for parameters that keep the
    // resonance ladder reasonably close to a clean 1..8 integer series
    // ACROSS positions 1-7 jointly (not just position 1 alone, which
    // fits much tighter on its own but degrades badly -- drift up to 2
    // full partials by position 7 -- once the cylinder eats a bigger
    // share of a fixed-length bell; see the README). This trades some
    // precision at position 1 for staying roughly-decent everywhere,
    // the same tradeoff real horn design faces. x1/x2 are overridable
    // per slide position (the bell itself doesn't change size when you
    // extend the slide; only the cylindrical section does -- theory.js).
    var defaults = HornEquation.DEFAULT_BELL_PROFILE;
    var profile = HornEquation.threeSegmentBellProfile({
      x1: opts.x1 != null ? opts.x1 : defaults.x1,
      x2: opts.x2 != null ? opts.x2 : defaults.x2,
      taperPower: opts.taperPower || defaults.taperPower,
      flarePower: opts.flarePower || defaults.flarePower,
      taperRatio: opts.taperRatio || defaults.taperRatio,
      bellRatio: opts.bellRatio || defaults.bellRatio
    });
    var modeK = HornEquation.findModes(profile.logAreaSlope, { maxModes: maxModes });
    // 500, not 140: fine enough that the seams between adjacent bands
    // don't show up as visible vertical lines.
    var POINTS = 500;
    var shapes = modeK.map(function (k) {
      return normalize(HornEquation.modeShape(profile.logAreaSlope, k, { points: POINTS }));
    });

    var svg = el("svg", {
      width: "100%", viewBox: "0 0 " + width + " " + height,
      preserveAspectRatio: "xMidYMid meet", class: "pipe-svg"
    });
    container.appendChild(svg);
    // Backdrop, painted first so the bands/wall/lips below draw on top.
    svg.appendChild(el("rect", { x: 0, y: 0, width: width, height: height, fill: GRAY_NEUTRAL_CSS }));

    var midY = height / 2;
    var left = margin;
    // lengthFraction < 1 draws a shorter tube within the same fixed
    // canvas (a longer slide position uses more of it) -- one fixed
    // viewBox throughout, so nothing else has to be recomputed.
    var lengthFraction = opts.lengthFraction != null ? opts.lengthFraction : 1;
    var right = left + lengthFraction * (width - margin - left);
    var maxRadiusPx = height / 2 - margin;
    var drawScale = maxRadiusPx / profile.radius(profile.length); // bell mouth just fits

    function toPx(fracX) { return left + fracX * (right - left); }

    // One band per sample interval, its x/width/localAmplitude all fixed
    // at construction (only fill color and the wave line's y change per
    // animation frame) -- computed once here rather than recomputed from
    // profile.radius (a handful of Math.pow calls) on every one of the
    // ~60 frames/sec this animates at.
    var bands = [];
    var bandX = [];
    var bandLocalAmplitude = [];
    for (var i = 0; i < POINTS; i++) {
      var fracL = i / POINTS, fracR = (i + 1) / POINTS;
      var xL = toPx(fracL), xR = toPx(fracR);
      var r = profile.radius(((fracL + fracR) / 2) * profile.length) * drawScale;
      var rect = el("rect", { x: xL, y: midY - r, width: (xR - xL) + 0.5, height: r * 2, fill: pressureColor(0) });
      svg.appendChild(rect);
      bands.push(rect);

      var frac = (i + 0.5) / POINTS;
      bandX.push(toPx(frac));
      bandLocalAmplitude.push(profile.radius(frac * profile.length) * drawScale * 0.7);
    }

    // Tube walls drawn on top of the color fill, sampled outline
    // following radius(x), mirrored top/bottom.
    var wallStrokeWidth = opts.wallStrokeWidth || 6;
    var topD = "", bottomD = "";
    for (var j = 0; j <= POINTS; j++) {
      var frac2 = j / POINTS;
      var x2 = toPx(frac2);
      var rr = profile.radius(frac2 * profile.length) * drawScale;
      topD += (j === 0 ? "M " : "L ") + x2 + " " + (midY - rr) + " ";
      bottomD += (j === 0 ? "M " : "L ") + x2 + " " + (midY + rr) + " ";
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

    // A schematic top lip and bottom lip, just to the left of the tube
    // (no mouthpiece drawn, just the two circles) -- the same pressure
    // value already driving the first band, given a literal shape too:
    // pulled apart when that pressure is driving air through, pressed
    // together at the instant it's momentarily cut off. Colored like
    // lips, not like the heatmap -- the motion alone already carries
    // the open/closed information, so the color doesn't need to repeat it.
    var LIP_COLOR = "#a05244";
    var lipX = left - 12;
    var lipRadius = 6;
    var lipRestGap = 5;   // half-gap when at rest (activeShape === null)
    var lipMinGap = 1;    // never fully cross, even at the most "closed" instant
    var lipGapAmplitude = 8;
    var lipTop = el("circle", { cx: lipX, cy: midY - lipRestGap, r: lipRadius, fill: LIP_COLOR });
    var lipBottom = el("circle", { cx: lipX, cy: midY + lipRestGap, r: lipRadius, fill: LIP_COLOR });
    svg.appendChild(lipTop);
    svg.appendChild(lipBottom);

    // Either setHarmonic (one of the real resonances, precomputed above)
    // or setFrequency (literally any lip frequency, resonant or not --
    // see the docstring) sets these same two variables; frame() doesn't
    // need to know or care which one drove them.
    var activeShape = null;
    var activeK = null;
    var phase = 0;
    var lastT = null;
    var running = true;

    function frame(t) {
      if (!running) return;
      if (lastT === null) lastT = t;
      var dt = (t - lastT) / 1000;
      lastT = t;
      if (activeShape) phase += speed * (activeK / modeK[0]) * dt;

      var d = "";
      for (var b = 0; b < bands.length; b++) {
        var envelope = activeShape ? (activeShape[b] + activeShape[b + 1]) / 2 : 0;
        var pressure = envelope * Math.cos(phase);
        bands[b].setAttribute("fill", pressureColor(pressure));
        var y = midY - pressure * bandLocalAmplitude[b];
        d += (b === 0 ? "M " : "L ") + bandX[b] + " " + y + " ";
      }
      wave.setAttribute("d", d);

      var lipValue = activeShape ? activeShape[0] * Math.cos(phase) : 0;
      var lipGap = Math.max(lipMinGap, lipRestGap + lipValue * lipGapAmplitude);
      lipTop.setAttribute("cy", midY - lipGap);
      lipBottom.setAttribute("cy", midY + lipGap);

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    function setHarmonic(n) {
      if (n == null) { activeShape = null; activeK = null; return; }
      activeShape = shapes[n - 1];
      activeK = modeK[n - 1];
    }

    // The ladder isn't evenly spaced (see the README/harmonic_theory.html on why
    // a schematic flare doesn't land on clean integer ratios), so
    // "partial 2" is NOT at 2x the fundamental's frequency -- it's at
    // whatever modeK[1] actually is. label is a partial NUMBER, possibly
    // fractional (interpolated between two real, found resonances, or
    // extrapolated a little past the first/last one) -- not a literal
    // frequency ratio. At any integer label this deliberately lands on
    // exactly the same k setHarmonic uses, so the two never disagree at
    // the points where they're supposed to describe the same thing.
    // Returns the resulting REAL frequency ratio (to modeK[0]), since
    // that's what a caller needs for audio pitch or for plotting this
    // spot on the (real-frequency-axed) impedance curve.
    function kAtLabel(label) {
      var lastSegment = modeK.length - 2;
      var idx = label - 1; // 0 lines up with modeK[0], 1 with modeK[1], ...
      var lo = Math.min(Math.max(Math.floor(idx), 0), lastSegment);
      var frac = idx - lo;
      return modeK[lo] + frac * (modeK[lo + 1] - modeK[lo]);
    }

    function setFrequency(label) {
      if (label == null) { activeShape = null; activeK = null; return null; }
      activeK = kAtLabel(label);
      activeShape = normalize(HornEquation.modeShape(profile.logAreaSlope, activeK, { points: POINTS }));
      return activeK / modeK[0];
    }

    // Read-only version of the same label->ratio lookup, for a caller
    // that just wants to know where a label sits (e.g. to position the
    // impedance-graph marker while setHarmonic, not setFrequency, is
    // the one actually driving the animated shape -- during the Play
    // button's own step-through, say) without disturbing activeShape.
    function ratioForLabel(label) {
      return kAtLabel(label) / modeK[0];
    }

    // A schematic stand-in for the bore's input impedance: how strongly
    // it resists (rather than absorbs) a given driving frequency. Real
    // impedance depends on real losses and a real open-end radiation
    // impedance, neither modeled here -- this is just 1/|residual of the
    // same idealized boundary condition findModes solves|, which is
    // exactly zero (impedance infinite) at a true lossless resonance and
    // small in between, the same qualitative shape for a much smaller
    // amount of new physics.
    function impedanceAt(relFreq) {
      var k = relFreq * modeK[0];
      var end = HornEquation.endValue(profile.logAreaSlope, k, profile.length, 300);
      return 1 / Math.max(0.015, Math.abs(end));
    }

    function impedanceCurve(minRelFreq, maxRelFreq, points) {
      points = points || 160;
      var curve = [];
      for (var i = 0; i <= points; i++) {
        var relFreq = minRelFreq + (maxRelFreq - minRelFreq) * i / points;
        curve.push({ relFreq: relFreq, z: impedanceAt(relFreq) });
      }
      return curve;
    }

    // Stops the animation loop for good -- without this, replacing a
    // makeBellPipe instance (e.g. on a slide-position change) just drops
    // the caller's own reference while the pending requestAnimationFrame
    // callback keeps rescheduling itself forever, keeping the detached
    // SVG, all 140 bands, and the shapes/modeK arrays alive indefinitely.
    function stop() {
      running = false;
    }

    return {
      setHarmonic: setHarmonic, setFrequency: setFrequency, ratioForLabel: ratioForLabel,
      impedanceAt: impedanceAt, impedanceCurve: impedanceCurve, stop: stop
    };
  }

  return { makeBellPipe: makeBellPipe };
});
