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
  // The bell's own absolute length is fixed (a real bell doesn't grow
  // when you extend the slide) -- only the cylindrical part lengthens,
  // so a longer position's flare starts at a *later* fraction of a
  // *longer* tube, calibrated so position 1 matches this page's
  // original, already-tested 50/50 cylinder/flare split.
  var FLARE_ABSOLUTE_LENGTH = 0.5;

  var staffSvg = document.getElementById("staff-svg");
  var numberRowContainer = document.getElementById("partial-numbers");
  var pipeContainer = document.getElementById("pipe");
  var bellPipeContainer = document.getElementById("pipe-bell");
  var positionSelect = document.getElementById("position-select");
  var playBtn = document.getElementById("play-btn");

  var series, staffHandle, numberRow, pipe, bellPipe;
  var playing = false;
  var NOTE_MS = 2200;

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
    var flareStart = 1 - FLARE_ABSOLUTE_LENGTH / tubeLength;

    pipeContainer.innerHTML = "";
    pipe = Pipe.makePipe(pipeContainer, { width: 800, height: 120, lengthFraction: lengthFraction });

    bellPipeContainer.innerHTML = "";
    bellPipe = PipeBell.makeBellPipe(bellPipeContainer, {
      width: 800, height: 160, lengthFraction: lengthFraction, flareStart: flareStart
    });
  }

  // ---- Playback: step up through the series from the bottom ----------------
  async function playAll() {
    if (playing) return;
    playing = true;
    playBtn.disabled = true;
    positionSelect.disabled = true;

    for (var i = 0; i < series.length; i++) {
      staffHandle.highlightNote(i);
      numberRow.highlightNote(i);
      pipe.setHarmonic(series[i].partial);
      bellPipe.setHarmonic(series[i].partial);
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
  }

  playBtn.addEventListener("click", playAll);
  positionSelect.addEventListener("change", function () {
    render(Number(positionSelect.value));
  });

  render(1);
})();
