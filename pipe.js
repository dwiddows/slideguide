/**
 * pipe.js: a schematic tube (two parallel lines) with an animated
 * standing wave inside it -- n loops for harmonic n, each antinode
 * swinging in and out over time rather than sitting still, so the
 * physical picture behind "partial n" is visible, not just implied by
 * a note on a staff.
 *
 * Deliberately has no dependency on music-theory.js or any of this
 * project's pitch code -- it only ever needs to be told which
 * whole-number harmonic to draw, nothing else, so it's reusable
 * anywhere a standing wave needs showing.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Pipe = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Draws the tube into `container` and returns a handle whose
  // setHarmonic(n) changes how many standing-wave loops animate inside
  // it (null shows no wave at all -- the pipe at rest, not buzzing).
  function makePipe(container, opts) {
    opts = opts || {};
    var width = opts.width || 600;
    var height = opts.height || 100;
    var margin = opts.margin || 20;
    var wallGap = opts.wallGap || 60; // vertical distance between the two tube walls
    // Angular speed for harmonic 1; higher harmonics are handed a
    // faster-oscillating standing wave (speed scales with n, the same
    // way a real higher partial is a higher frequency), so the
    // animation itself carries that part of the acoustics, not just
    // the loop count.
    var speed = opts.speed || 2.2;

    var svg = el("svg", {
      width: "100%", viewBox: "0 0 " + width + " " + height,
      preserveAspectRatio: "xMidYMid meet", class: "pipe-svg"
    });
    container.appendChild(svg);

    var midY = height / 2;
    var top = midY - wallGap / 2;
    var bottom = midY + wallGap / 2;
    var left = margin;
    // lengthFraction < 1 draws a shorter tube within the same fixed
    // canvas (a longer slide position uses more of it) -- one fixed
    // viewBox throughout, so nothing else has to be recomputed.
    var lengthFraction = opts.lengthFraction != null ? opts.lengthFraction : 1;
    var right = left + lengthFraction * (width - margin - left);
    var amplitude = wallGap / 2 - 6; // stay clear of the walls themselves

    var wallStrokeWidth = opts.wallStrokeWidth || 6;
    svg.appendChild(el("line", {
      x1: left, y1: top, x2: right, y2: top, stroke: "var(--brass-dim)", "stroke-width": wallStrokeWidth
    }));
    svg.appendChild(el("line", {
      x1: left, y1: bottom, x2: right, y2: bottom, stroke: "var(--brass-dim)", "stroke-width": wallStrokeWidth
    }));

    var wave = el("path", { fill: "none", stroke: "#2ecc71", "stroke-width": 2.5 });
    svg.appendChild(wave);

    var harmonic = null;
    var phase = 0;
    var lastT = null;
    var POINTS = 120;

    function frame(t) {
      if (lastT === null) lastT = t;
      var dt = (t - lastT) / 1000;
      lastT = t;
      if (harmonic) phase += speed * harmonic * dt;

      var d = "";
      for (var i = 0; i <= POINTS; i++) {
        var frac = i / POINTS;
        var x = left + frac * (right - left);
        // n loops across the tube's length: n half-cycles of a sine
        // envelope, each one swinging between + and -amplitude in
        // time together (cos(phase)) rather than travelling along the
        // tube -- a standing wave, not a travelling one.
        var envelope = harmonic ? Math.sin(harmonic * Math.PI * frac) : 0;
        var y = midY - envelope * amplitude * Math.cos(phase);
        d += (i === 0 ? "M " : "L ") + x + " " + y + " ";
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

  return { makePipe: makePipe };
});
