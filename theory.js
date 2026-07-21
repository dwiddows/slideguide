/**
 * theory.html: the natural harmonic series over this horn's own pedal
 * B♭ (position 1, no slide movement) -- partials 1..8, drawn on the
 * same staff and played with the same tone this project's trombone
 * calculator already uses (see staff-view.js), stepping up through
 * them one at a time on Play.
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
  var series = TrombonePositions.naturalHarmonicSeries(MAX_PARTIAL);

  var staffSvg = document.getElementById("staff-svg");
  var numberRowContainer = document.getElementById("partial-numbers");

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
  // Pedal B♭ (partial 1) sits well below the staff's own bottom line,
  // unlike anything the trombone calculator's own melodies reach down
  // to -- so, unlike that page, this one can't assume the lowest note
  // is at or above step 0 when sizing the canvas.
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
  var staffHandle = makeStaff(staffSvg, {
    left: left, right: staffWidth - rightMargin, bottomY: bottomY, stepH: stepH,
    keyFlats: 0, keyFlatBStep: 2, keySharps: 0, keySharpFStep: 6,
    noteX: noteX, notes: staffNotes
  });

  var numberRow = makeNumberRow(numberRowContainer, {
    format: function (partial) { return partial; },
    wrapClass: "number-row"
  });
  numberRow.setNumbers(series.map(function (h) { return h.partial; }), noteX);

  var pipe = Pipe.makePipe(document.getElementById("pipe"), { width: 800, height: 120 });
  var bellPipe = PipeBell.makeBellPipe(document.getElementById("pipe-bell"), { width: 800, height: 160 });

  // ---- Playback: step up through the series from the bottom ----------------
  var playBtn = document.getElementById("play-btn");
  var playing = false;
  var NOTE_MS = 1100;

  async function playAll() {
    if (playing) return;
    playing = true;
    playBtn.disabled = true;

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
  }

  playBtn.addEventListener("click", playAll);
})();
