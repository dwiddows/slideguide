/**
 * theory.html: the natural harmonic series over a chosen slide
 * position's own fundamental -- partials 1..8, drawn on the same staff
 * and played with the same tone this project's trombone calculator
 * already uses (see staff-view.js), stepping up through them one at a
 * time on Play. Changing position re-renders everything for that
 * position's fundamental and (schematically) lengthens the tube in
 * both pipe pictures to match.
 */
(function () {
  "use strict";

  var el = StaffView.el;
  var clearSvg = StaffView.clearSvg;
  var makeStaff = StaffView.makeStaff;
  var makeNumberRow = StaffView.makeNumberRow;
  var playTone = StaffView.playTone;
  var sleep = StaffView.sleep;

  var MAX_PARTIAL = 8;

  var staffSvg = document.getElementById("staff-svg");
  var numberRowContainer = document.getElementById("partial-numbers");
  var pipeContainer = document.getElementById("pipe");
  var bellPipeContainer = document.getElementById("pipe-bell");
  var positionSelect = document.getElementById("position-select");
  var playBtn = document.getElementById("play-btn");
  var freqSlider = document.getElementById("freq-slider");
  var freqValue = document.getElementById("freq-value");
  var impedanceSvg = document.getElementById("impedance-svg");

  var series, staffHandle, numberRow, pipe, bellPipe;
  var impedanceMarker = null;
  var markerXScale = null;
  var playing = false;
  var NOTE_MS = 2200;

  // The slider's own units (30..870) are relFreq*100, just so the range
  // input can work in plain integers -- 1.00x lines up with the lowest
  // resonance, matching setHarmonic(1).
  var MIN_REL_FREQ = 0.30, MAX_REL_FREQ = 8.70;

  function drawImpedanceCurve() {
    var width = 800, height = 140, margin = 30;
    var left = margin, right = width - margin;
    var topY = margin * 0.4, bottomY = height - margin * 0.4;
    var maxZ = 70;

    function x(relFreq) { return left + (relFreq - MIN_REL_FREQ) / (MAX_REL_FREQ - MIN_REL_FREQ) * (right - left); }
    function y(z) { return bottomY - Math.min(z, maxZ) / maxZ * (bottomY - topY); }

    impedanceSvg.setAttribute("viewBox", "0 0 " + width + " " + height);
    impedanceSvg.setAttribute("width", width);
    impedanceSvg.setAttribute("height", height);
    clearSvg(impedanceSvg);

    impedanceSvg.appendChild(el("line", {
      x1: left, y1: bottomY, x2: right, y2: bottomY, stroke: "var(--brass-dim)", "stroke-width": 1
    }));

    var curve = bellPipe.impedanceCurve(MIN_REL_FREQ, MAX_REL_FREQ, 200);
    var d = curve.map(function (pt, i) {
      return (i === 0 ? "M " : "L ") + x(pt.relFreq) + " " + y(pt.z);
    }).join(" ");
    impedanceSvg.appendChild(el("path", { d: d, fill: "none", stroke: "var(--brass)", "stroke-width": 2 }));

    impedanceMarker = el("line", {
      x1: x(1), y1: topY, x2: x(1), y2: bottomY, stroke: "#2ecc71", "stroke-width": 2
    });
    impedanceSvg.appendChild(impedanceMarker);

    // Stored so updateDisplay (called far more often, on every slider
    // drag) doesn't need to rebuild the whole curve just to move the marker.
    markerXScale = x;
  }

  // Moves the slider itself, its numeric readout, and the impedance-graph
  // marker -- shared by both updateSliderDisplay (display-only, used
  // while playAll drives the bell diagram directly via setHarmonic) and
  // applyFrequency (which also drives the bell diagram, for a direct
  // slider drag). The slider's own units are a partial NUMBER (possibly
  // fractional -- interpolated between two real resonances), not a
  // frequency ratio -- "2" means exactly the same k as setHarmonic(2),
  // not literally 2x the fundamental (the ladder isn't evenly spaced;
  // see pipe-bell.js). The readout shows both, since that gap IS the
  // point being demonstrated.
  function updateDisplay(label, realRatio) {
    freqSlider.value = Math.round(label * 100);
    freqValue.textContent = "partial " + label.toFixed(2) + " → " + realRatio.toFixed(2) + "× the fundamental";
    if (impedanceMarker) {
      var xPos = markerXScale(realRatio);
      impedanceMarker.setAttribute("x1", xPos);
      impedanceMarker.setAttribute("x2", xPos);
    }
  }

  // Display-only: used by playAll to keep the slider in sync while it's
  // actually driving the bell diagram via the exact (not approximated)
  // resonance shapes through setHarmonic instead.
  function updateSliderDisplay(label) {
    updateDisplay(label, bellPipe.ratioForLabel(label));
  }

  // Used when the user drags the slider directly -- this actually
  // drives the bell diagram's animated shape, at the exact k for this
  // (possibly fractional) partial label. Returns the real ratio, for
  // the caller to use for audio pitch.
  function applyFrequency(label) {
    var realRatio = bellPipe.setFrequency(label);
    updateDisplay(label, realRatio);
    return realRatio;
  }

  // A live tone while dragging the slider: pitch is the fundamental
  // times the REAL frequency ratio for wherever the slider actually
  // landed, volume follows the bore's own impedance there -- loud near
  // a resonance, quiet in between, the same "amplifies some, cancels
  // others" idea the impedance graph shows, just audible instead of
  // only visible. Fades out after a short idle period rather than
  // cutting off the instant the slider stops moving.
  var continuousTone = null;
  var continuousToneIdleTimer = null;
  var MAX_IMPEDANCE_FOR_GAIN = 40;

  function playContinuousTone(realRatio) {
    if (!continuousTone) continuousTone = StaffView.makeContinuousTone();
    var fundamentalFreq = MusicTheory.frequency(series[0].note);
    var z = bellPipe.impedanceAt(realRatio);
    var gain = 0.02 + 0.28 * Math.min(1, z / MAX_IMPEDANCE_FOR_GAIN);
    continuousTone.setFrequency(fundamentalFreq * realRatio);
    continuousTone.setGain(gain);

    clearTimeout(continuousToneIdleTimer);
    continuousToneIdleTimer = setTimeout(function () {
      continuousTone.setGain(0);
    }, 200);
  }

  function render(position) {
    series = TrombonePositions.naturalHarmonicSeries(MAX_PARTIAL, position);

    // Same responsive scale factor as the trombone calculator's own
    // staff, for the same reason: this is a mnemonic diagram, not
    // something that needs full-size legibility on a phone screen.
    var STAFF_SCALE = window.innerWidth < 600 ? 0.45 : 2 / 3;
    var stepH = 11 * STAFF_SCALE;
    var margin = 40 * STAFF_SCALE;
    var left = 60 * STAFF_SCALE;
    var rightMargin = 20 * STAFF_SCALE;

    var staffNotes = series.map(function (h) {
      return {
        note: MusicTheory.noteName(h.note), step: MusicTheory.toBassClefStep(h.note),
        letter: h.note.letter, accidental: h.note.accidental, octave: h.note.octave
      };
    });
    // Pedal partial 1 sits well below the staff's own bottom line at
    // every position, unlike anything the trombone calculator's own
    // melodies reach down to -- so, unlike that page, this one can't
    // assume the lowest note is at or above step 0 when sizing the canvas.
    var steps = staffNotes.map(function (n) { return n.step; });
    var maxStep = Math.max.apply(null, steps);
    var minStep = Math.min.apply(null, steps);
    var bottomY = maxStep * stepH + margin;
    var staffHeight = bottomY - Math.min(0, minStep) * stepH + margin;

    // A fixed gap per note (there's no rhythm here, every partial gets
    // the same time and the same room) rather than the calculator's
    // duration-proportional spacing.
    var noteSpacing = 70 * STAFF_SCALE;
    var noteX = staffNotes.map(function (_, i) { return 170 * STAFF_SCALE + i * noteSpacing; });
    var staffWidth = noteX[noteX.length - 1] + margin + 40 * STAFF_SCALE;

    staffSvg.setAttribute("viewBox", "0 0 " + staffWidth + " " + staffHeight);
    staffSvg.setAttribute("width", staffWidth);
    staffSvg.setAttribute("height", staffHeight);

    clearSvg(staffSvg);
    // No key signature: the overtone series isn't "in a key," it's the
    // horn's own physics, so every accidental (the flat 7th partial
    // included) is written explicitly rather than folded into a signature.
    staffHandle = makeStaff(staffSvg, {
      left: left, right: staffWidth - rightMargin, bottomY: bottomY, stepH: stepH,
      keyFlats: 0, keyFlatBStep: 2, keySharps: 0, keySharpFStep: 6,
      noteX: noteX, notes: staffNotes
    });

    numberRowContainer.innerHTML = "";
    numberRow = makeNumberRow(numberRowContainer, {
      format: function (partial) { return partial; },
      wrapClass: "number-row"
    });
    numberRow.setNumbers(series.map(function (h) { return h.partial; }), noteX);

    // Position 7's tube (a tritone's worth of slide extension) is the
    // longest -- everything else draws shorter within the same canvas.
    var tubeLength = TrombonePositions.relativeTubeLength(position);
    var maxTubeLength = TrombonePositions.relativeTubeLength(TrombonePositions.MAX_POSITION);
    var lengthFraction = tubeLength / maxTubeLength;
    var defaultProfile = HornEquation.DEFAULT_BELL_PROFILE;
    var bounds = HornEquation.bellBoundariesForTubeLength(tubeLength, defaultProfile.x1, defaultProfile.x2);

    // Old instances' animation loops don't stop just because these
    // variables get reassigned -- their own requestAnimationFrame
    // callbacks would otherwise keep rescheduling themselves forever on
    // an now-detached SVG.
    if (pipe) pipe.stop();
    if (bellPipe) bellPipe.stop();

    pipeContainer.innerHTML = "";
    pipe = Pipe.makePipe(pipeContainer, { width: 800, height: 120, lengthFraction: lengthFraction });

    bellPipeContainer.innerHTML = "";
    bellPipe = PipeBell.makeBellPipe(bellPipeContainer, {
      width: 800, height: 160, lengthFraction: lengthFraction, x1: bounds.x1, x2: bounds.x2
    });

    // This position's bore has its own actual resonances (see the
    // README on why a schematic profile like this one doesn't land
    // exactly on integer ratios) -- rebuild the curve, and reapply
    // the slider's current setting to the fresh bellPipe instance.
    drawImpedanceCurve();
    applyFrequency(Number(freqSlider.value) / 100);
  }

  // ---- Playback: step up through the series from the bottom ----------------
  async function playAll() {
    if (playing) return;
    playing = true;
    playBtn.disabled = true;
    positionSelect.disabled = true;
    freqSlider.disabled = true;
    if (continuousTone) continuousTone.setGain(0);

    for (var i = 0; i < series.length; i++) {
      staffHandle.highlightNote(i);
      numberRow.highlightNote(i);
      pipe.setHarmonic(series[i].partial);
      bellPipe.setHarmonic(series[i].partial);
      updateSliderDisplay(series[i].partial);
      playTone(MusicTheory.frequency(series[i].note), NOTE_MS * 0.9);
      await sleep(NOTE_MS);
    }

    await sleep(150);
    staffHandle.highlightNote(-1);
    numberRow.highlightNote(-1);
    pipe.setHarmonic(null);
    bellPipe.setHarmonic(null);
    playing = false;
    playBtn.disabled = false;
    positionSelect.disabled = false;
    freqSlider.disabled = false;
  }

  playBtn.addEventListener("click", playAll);
  freqSlider.addEventListener("input", function () {
    var label = Number(freqSlider.value) / 100;
    var realRatio = applyFrequency(label);
    playContinuousTone(realRatio);
  });
  positionSelect.addEventListener("change", function () {
    render(Number(positionSelect.value));
  });

  render(1);
})();
