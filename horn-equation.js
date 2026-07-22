/**
 * Numerically solves the Webster horn equation --
 *   p''(x) + (S'(x)/S(x)) p'(x) + k^2 p(x) = 0
 * -- for a duct whose cross-sectional area S(x) varies along its
 * length, closed (rigid) at x=0 and idealized-open (p=0) at x=length.
 * S itself never needs to be evaluated; the equation only ever needs
 * its logarithmic derivative S'/S, which callers supply directly.
 *
 * This is the general tool behind pipe.js's simplified uniform-tube
 * picture: a plain cylinder (S'/S = 0 everywhere) reduces this exactly
 * to sin/cos and reproduces the textbook odd-harmonic-only ladder of a
 * closed-open pipe; a profile that flares out enough near the open end
 * pulls the resonances back toward an even spacing instead, which is
 * the real mechanism a brass bell relies on (see pipe-bell.js and the
 * README's references).
 *
 * Pure math, no DOM -- runs under plain Node (see horn-equation.test.js)
 * as well as in the browser.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.HornEquation = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // One RK4 step of the system [p, p'] given p(0)=1, p'(0)=0 (a rigid
  // closed end: the reference amplitude is arbitrary since the
  // equation is linear, but zero slope there is the real boundary
  // condition -- no air motion through a rigid cap).
  function integrate(logAreaSlope, k, length, steps) {
    var h = length / steps;
    var p = 1, dp = 0;
    var samples = [{ x: 0, p: p }];
    function derivs(x, p, dp) {
      var slope = logAreaSlope(x);
      return [dp, -slope * dp - k * k * p];
    }
    for (var i = 0; i < steps; i++) {
      var x = i * h;
      var k1 = derivs(x, p, dp);
      var k2 = derivs(x + h / 2, p + h / 2 * k1[0], dp + h / 2 * k1[1]);
      var k3 = derivs(x + h / 2, p + h / 2 * k2[0], dp + h / 2 * k2[1]);
      var k4 = derivs(x + h, p + h * k3[0], dp + h * k3[1]);
      p = p + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      dp = dp + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      samples.push({ x: x + h, p: p });
    }
    return samples;
  }

  function endValue(logAreaSlope, k, length, steps) {
    var samples = integrate(logAreaSlope, k, length, steps);
    return samples[samples.length - 1].p;
  }

  // Bisection refinement of a root already bracketed between kLo, kHi
  // (endValue changes sign somewhere in that interval).
  function refineRoot(logAreaSlope, kLo, kHi, length, steps) {
    var fLo = endValue(logAreaSlope, kLo, length, steps);
    for (var iter = 0; iter < 50; iter++) {
      var kMid = (kLo + kHi) / 2;
      var fMid = endValue(logAreaSlope, kMid, length, steps);
      if ((fMid < 0) === (fLo < 0)) { kLo = kMid; fLo = fMid; } else { kHi = kMid; }
    }
    return (kLo + kHi) / 2;
  }

  // Scans k upward from ~0 and returns the first maxModes values where
  // the open end's boundary condition (p=0) is satisfied -- the tube's
  // resonances, in ascending order (index 0 is the fundamental/partial 1).
  // Defaults are deliberately coarse: the scan only needs a correct sign
  // to bracket each root (refineRoot's own bisection is what actually
  // homes in on it), so resolving every candidate k to page-load-blocking
  // precision here is wasted work -- these defaults match a found root to
  // within ~0.005 of the much finer (steps=1500, scanStep=0.004) result,
  // at roughly 1/10th the cost. Pass steps/scanStep explicitly for a
  // one-off higher-precision answer if a caller ever needs one.
  function findModes(logAreaSlope, opts) {
    opts = opts || {};
    var length = opts.length || 1;
    var steps = opts.steps || 300;
    var maxModes = opts.maxModes || 8;
    var kMax = opts.kMax || maxModes * Math.PI + 3;
    var scanStep = opts.scanStep || 0.01;

    var roots = [];
    var prevK = 1e-6;
    var prevF = endValue(logAreaSlope, prevK, length, steps);
    for (var k = prevK + scanStep; k <= kMax && roots.length < maxModes; k += scanStep) {
      var f = endValue(logAreaSlope, k, length, steps);
      if ((f < 0) !== (prevF < 0)) {
        roots.push(refineRoot(logAreaSlope, prevK, k, length, steps));
      }
      prevK = k; prevF = f;
    }
    return roots;
  }

  // The actual mode shape p(x) for one already-found k, sampled evenly
  // across [0, length] -- what a caller draws/animates as the standing
  // wave envelope.
  function modeShape(logAreaSlope, k, opts) {
    opts = opts || {};
    var length = opts.length || 1;
    var points = opts.points || 200;
    return integrate(logAreaSlope, k, length, points);
  }

  // A schematic bore: a cylindrical throat (radius 1, in whatever units
  // the caller likes) out to flareStart (a fraction of length), then a
  // smooth power-law flare -- continuous in radius at the join (no
  // physically-bogus jump), reaching bellRatio times the throat radius
  // at the open end. This is the same "Bessel horn" family (D = B/(y+y0)^m,
  // Benade) real bell profiles are fit to -- see the README's references --
  // just with schematic, not measured, proportions. Returns both the
  // radius function (for drawing) and its logarithmic-derivative-of-area
  // (for the ODE above), built from the same numbers so the two always
  // agree with each other.
  function compoundBellProfile(opts) {
    opts = opts || {};
    var length = opts.length || 1;
    var flareStart = opts.flareStart != null ? opts.flareStart : 0.5;
    var bellRatio = opts.bellRatio || 8;
    var power = opts.power || 2;
    var flareLength = length - flareStart;
    var u0 = flareLength / (Math.pow(bellRatio, 1 / power) - 1);

    function radius(x) {
      if (x <= flareStart) return 1;
      return Math.pow(1 + (x - flareStart) / u0, power);
    }
    function logAreaSlope(x) {
      if (x <= flareStart) return 0;
      return (2 * power) / (u0 + (x - flareStart));
    }
    return { radius: radius, logAreaSlope: logAreaSlope, flareStart: flareStart, length: length };
  }

  // A closer schematic to how real bells are actually shaped: not one
  // flare rate, but a long cylindrical bore, then a gentle taper, and
  // only a short RAPID flare right at the rim -- three stages, not two.
  // Found by numerical search (not measured, not hand-picked) for
  // parameters that pull compoundBellProfile's single-flare ladder
  // (drifting a full partial away from integers by partial 8) back
  // toward a clean 1..8 ladder -- see the README and DEFAULT_BELL_PROFILE
  // below for how close. Radius is continuous at both joins (no jump),
  // same as compoundBellProfile.
  function threeSegmentBellProfile(opts) {
    opts = opts || {};
    var length = opts.length || 1;
    var x1 = opts.x1;                  // cylinder ends, gentle taper begins
    var x2 = opts.x2;                  // gentle taper ends, rapid flare begins
    var taperPower = opts.taperPower;
    var flarePower = opts.flarePower;
    var taperRatio = opts.taperRatio;  // radius (relative to throat) reached at x2
    var bellRatio = opts.bellRatio;    // radius (relative to throat) reached at x=length
    var u1 = (x2 - x1) / (Math.pow(taperRatio, 1 / taperPower) - 1);
    var u2 = (length - x2) / (Math.pow(bellRatio / taperRatio, 1 / flarePower) - 1);

    function radius(x) {
      if (x <= x1) return 1;
      if (x <= x2) return Math.pow(1 + (x - x1) / u1, taperPower);
      return taperRatio * Math.pow(1 + (x - x2) / u2, flarePower);
    }
    function logAreaSlope(x) {
      if (x <= x1) return 0;
      if (x <= x2) return (2 * taperPower) / (u1 + (x - x1));
      return (2 * flarePower) / (u2 + (x - x2));
    }
    return { radius: radius, logAreaSlope: logAreaSlope, length: length };
  }

  // The one numerically-found parameter set pipe-bell.js, theory.js, and
  // horn-equation.test.js all share -- fit JOINTLY across slide positions
  // 1-7 (not position 1 alone, which fits tighter, ~0.08, but degrades to
  // ~2 full partials of drift by position 7), keeping every position's
  // ladder within roughly 0.1-0.5 of a clean integer series instead. See
  // the README for how this was found.
  var DEFAULT_BELL_PROFILE = {
    x1: 0.1311, x2: 0.7776,
    taperPower: 1.1752, flarePower: 4.8895,
    taperRatio: 3.3279, bellRatio: 10.7865
  };

  // x1/x2 as fractions of a tube tubeLength times as long as the
  // reference (position 1) length those two were fit at: the bell
  // itself -- everything from refX1 onward, in reference-length units --
  // doesn't grow when the slide extends, only the cylindrical section
  // does, so both fractions shrink as the tube (and only the tube) grows.
  function bellBoundariesForTubeLength(tubeLength, refX1, refX2) {
    var bellAbsoluteLength = 1 - refX1;
    var rapidFlareAbsoluteLength = 1 - refX2;
    return {
      x1: 1 - bellAbsoluteLength / tubeLength,
      x2: 1 - rapidFlareAbsoluteLength / tubeLength
    };
  }

  return {
    integrate: integrate,
    endValue: endValue,
    findModes: findModes,
    modeShape: modeShape,
    compoundBellProfile: compoundBellProfile,
    threeSegmentBellProfile: threeSegmentBellProfile,
    DEFAULT_BELL_PROFILE: DEFAULT_BELL_PROFILE,
    bellBoundariesForTubeLength: bellBoundariesForTubeLength
  };
});
