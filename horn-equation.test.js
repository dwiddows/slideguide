/**
 * node horn-equation.test.js
 */
var HornEquation = require("./horn-equation.js");
var TrombonePositions = require("./trombone-positions.js");

var failures = 0;
var passes = 0;

function assert(condition, message) {
  if (condition) {
    passes++;
  } else {
    failures++;
    console.error("FAIL: " + message);
  }
}

function closeTo(a, b, tolerance) { return Math.abs(a - b) < tolerance; }

// ---- A plain cylinder (S'/S = 0 everywhere) is a closed-open pipe:
// its resonances are the textbook odd-harmonic-only ladder, k*length =
// (2n-1)*pi/2. This is the sanity check that the solver reproduces a
// known-by-hand result before trusting it on anything more elaborate. --
(function () {
  var roots = HornEquation.findModes(function () { return 0; }, { maxModes: 8 });
  var ratios = roots.map(function (k) { return k / roots[0]; });
  assertRatiosClose(ratios, [1, 3, 5, 7, 9, 11, 13, 15], "plain cylinder: odd harmonics only");
})();

// ---- A pure cone (closed at its apex, area proportional to x^2 over
// its whole length) is the one case with a known-by-hand *different*
// answer: it has exactly the same resonance spectrum as an open-open
// cylinder -- the full integer series, k*length = n*pi. This is the
// mechanism a brass bell exploits, in its cleanest possible form. -------
(function () {
  var eps = 1e-4;
  var coneSlope = function (x) { return 2 / (x + eps); };
  var roots = HornEquation.findModes(coneSlope, { maxModes: 8 });
  roots.forEach(function (k, i) {
    assert(closeTo(k / Math.PI, i + 1, 0.01),
      "pure cone: mode " + (i + 1) + " should land near k/pi=" + (i + 1) + " (got " + (k / Math.PI).toFixed(4) + ")");
  });
})();

// ---- compoundBellProfile: radius is continuous at the flare join (no
// unphysical jump), and reaches exactly the requested bellRatio at the
// open end. -------------------------------------------------------------
(function () {
  var profile = HornEquation.compoundBellProfile({ flareStart: 0.5, bellRatio: 8, power: 2 });
  assert(closeTo(profile.radius(0.5), 1, 1e-9), "radius at the throat is 1 (the reference radius)");
  assert(closeTo(profile.radius(0.5 - 1e-9), profile.radius(0.5 + 1e-9), 1e-4),
    "radius has no jump right at the flare join");
  assert(closeTo(profile.radius(1), 8, 1e-6), "radius at the open end matches the requested bellRatio");
})();

// ---- The whole point: 8 resonances exist, strictly increasing, and
// -- unlike the plain cylinder above -- their spacing is much more even
// than the odd-only ladder's alternating-by-2 pattern (not claiming an
// exact integer series; see theory.html/README for why a schematic,
// continuous flare doesn't hit that exactly, only a real bell's more
// elaborate shape would). --------------------------------------------
(function () {
  var profile = HornEquation.compoundBellProfile({ flareStart: 0.5, bellRatio: 8, power: 2 });
  var roots = HornEquation.findModes(profile.logAreaSlope, { maxModes: 8 });
  assert(roots.length === 8, "finds all 8 requested modes");
  for (var i = 1; i < roots.length; i++) {
    assert(roots[i] > roots[i - 1], "modes are strictly increasing (mode " + (i + 1) + " > mode " + i + ")");
  }
  var gaps = [];
  for (var j = 1; j < roots.length; j++) gaps.push(roots[j] - roots[j - 1]);
  var meanGap = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
  var maxDeviation = Math.max.apply(null, gaps.map(function (g) { return Math.abs(g - meanGap); }));
  assert(maxDeviation / meanGap < 0.35,
    "gaps between modes stay reasonably even (within 35% of the mean), unlike a plain cylinder's 2x/0x alternation");
})();

// ---- threeSegmentBellProfile, with the one set of numbers pipe-bell.js
// and theory.js also use (HornEquation.DEFAULT_BELL_PROFILE -- a joint
// fit across positions 1-7, not position 1 alone: that fits tighter,
// within ~0.08, but degrades to ~2 full partials of drift by position 7,
// since a fixed-length bell corrects a proportionally bigger cylinder
// less. This fit trades some of that position-1 precision for staying
// reasonable everywhere). Radius is continuous at BOTH joins (no jump
// at the cylinder/taper join or the taper/flare join), and reaches the
// requested ratios at each landmark. -------------------------------------
(function () {
  var p = HornEquation.DEFAULT_BELL_PROFILE;
  var profile = HornEquation.threeSegmentBellProfile(p);
  assert(closeTo(profile.radius(p.x1), 1, 1e-9), "radius at the throat/taper join is 1");
  assert(closeTo(profile.radius(p.x1 - 1e-9), profile.radius(p.x1 + 1e-9), 1e-3),
    "radius has no jump at the cylinder/taper join");
  assert(closeTo(profile.radius(p.x2), p.taperRatio, 1e-3), "radius at the taper/flare join matches taperRatio");
  assert(closeTo(profile.radius(p.x2 - 1e-9), profile.radius(p.x2 + 1e-9), 1e-3),
    "radius has no jump at the taper/flare join");
  assert(closeTo(profile.radius(1), p.bellRatio, 1e-3), "radius at the open end matches bellRatio");

  // The point of building this richer profile at all: a real bell's
  // gentle-taper-then-rapid-flare shape (not one single flare rate)
  // pulls the ladder much closer to a clean integer series than
  // compoundBellProfile's single flare managed.
  var roots = HornEquation.findModes(profile.logAreaSlope, { maxModes: 8 });
  roots.forEach(function (k, i) {
    var ratio = k / roots[0];
    assert(closeTo(ratio, i + 1, 0.3),
      "partial " + (i + 1) + " should be within 0.3 of ratio " + (i + 1) + " (got " + ratio.toFixed(3) + ")");
  });
})();

// ---- Position robustness: theory.js keeps the bell's own absolute
// length fixed and only grows the cylindrical section for lower
// positions (HornEquation.bellBoundariesForTubeLength). Reproducing
// that same x1/x2 recalculation here (using the real
// TrombonePositions.relativeTubeLength, not a re-derived copy of its
// formula) and checking every position from 1 to 7 is the actual claim
// this profile is trying to make: reasonably close everywhere, not just
// at position 1. ---------------------------------------------------------
(function () {
  var p = HornEquation.DEFAULT_BELL_PROFILE;
  for (var position = 1; position <= 7; position++) {
    var tubeLength = TrombonePositions.relativeTubeLength(position);
    var bounds = HornEquation.bellBoundariesForTubeLength(tubeLength, p.x1, p.x2);
    var profile = HornEquation.threeSegmentBellProfile({
      x1: bounds.x1, x2: bounds.x2,
      taperPower: p.taperPower, flarePower: p.flarePower, taperRatio: p.taperRatio, bellRatio: p.bellRatio
    });
    var roots = HornEquation.findModes(profile.logAreaSlope, { maxModes: 8 });
    roots.forEach(function (k, i) {
      var ratio = k / roots[0];
      assert(closeTo(ratio, i + 1, 0.6),
        "position " + position + ", partial " + (i + 1) + " should stay within 0.6 of ratio " +
        (i + 1) + " (got " + ratio.toFixed(3) + ")");
    });
  }
})();

function assertRatiosClose(actual, expected, message) {
  var ok = actual.length === expected.length &&
    actual.every(function (a, i) { return closeTo(a, expected[i], 0.01); });
  assert(ok, message + " (got " + actual.map(function (n) { return n.toFixed(3); }).join(",") + ")");
}

console.log(passes + " passed, " + failures + " failed");
process.exit(failures > 0 ? 1 : 0);
