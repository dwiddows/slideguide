/**
 * slide_theory.html: inverts the position/partial table -- for every
 * note in the natural harmonic series across all 7 positions, which
 * (position, partial) combinations reach it. Built from the same
 * TrombonePositions.naturalHarmonicSeries data harmonic_theory.html's
 * own table uses, not a separate hand-typed source, so the two pages
 * can't drift out of sync with each other.
 */
(function () {
  "use strict";

  var el = StaffView.el;
  var playTone = StaffView.playTone;
  var sleep = StaffView.sleep;
  var MAX_PARTIAL = 9; // trombone-positions.js's PARTIAL_INTERVAL/APPROXIMATE_PARTIALS stop here
  var STAFF_BOTTOM_LINE_STEP = 0; // bass clef bottom line (see staff-view.js)
  var STAFF_TOP_LINE_STEP = 8;

  var tableBody = document.getElementById("note-table-body");

  // Different positions can spell the same pitch differently (e.g.
  // position 2's 5th partial is C♯4, position 5's 3rd is D♭4) -- so
  // notes are grouped by absolute semitone, then re-spelled with this
  // app's usual flat-preferred convention, rather than by their
  // as-generated letter name (which would wrongly split one pitch into
  // two rows).
  var CHROMATIC_FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  function canonicalNote(semitone) {
    var octave = Math.floor(semitone / 12);
    var name = CHROMATIC_FLAT_NAMES[semitone - octave * 12];
    return { letter: name[0], accidental: name.length > 1 ? -1 : 0, octave: octave };
  }

  // Position 1's own 8th partial, B♭4 -- the top of the range this list
  // covers. The 9th partial (below) reaches a bit higher than that for
  // some positions (e.g. position 1's own 9th is C5), but those are
  // outside the practical range this page is about, so they're dropped
  // rather than tacked on as new top notes.
  var TOP_SEMITONE = MusicTheory.absoluteSemitone({ letter: "B", accidental: -1, octave: 4 });

  var bySemitone = {}; // semitone -> { note, step, options: [{position, partial, approximate}] }

  for (var position = 1; position <= TrombonePositions.MAX_POSITION; position++) {
    var series = TrombonePositions.naturalHarmonicSeries(MAX_PARTIAL, position);
    series.forEach(function (h) {
      // Position 1's 7th partial has no real fix: the correction
      // players use is shortening the slide, and position 1 is
      // already the slide fully closed -- same exclusion the position
      // table above marks with "--" instead of a note.
      if (position === 1 && h.partial === 7) return;
      var semitone = MusicTheory.absoluteSemitone(h.note);
      if (semitone > TOP_SEMITONE) return;
      if (!bySemitone[semitone]) {
        var note = canonicalNote(semitone);
        bySemitone[semitone] = { semitone: semitone, note: note, step: MusicTheory.toBassClefStep(note), options: [] };
      }
      // Only the 7th partial gets the asterisk here: it's genuinely
      // out of tune. The 9th (trombone-positions.js's other
      // "approximate" partial) is in tune, just an awkward stretch to
      // reach -- a different caveat, not this list's concern.
      bySemitone[semitone].options.push({ position: position, partial: h.partial, approximate: h.partial === 7 });
    });
  }

  var notes = Object.keys(bySemitone).map(function (k) { return bySemitone[k]; });
  // True pitch, not diatonic staff step: a flat and its natural (D♭4,
  // D4) share a staff line/step since they only differ by accidental,
  // so sorting on step alone ties them -- and D♭4 would then win the
  // tie (it's built from a lower semitone, so it lands earlier in the
  // by-semitone insertion order that ties fall back on), listing the
  // flat above the natural it's actually a semitone below.
  notes.sort(function (a, b) { return b.semitone - a.semitone; }); // highest pitch first

  var STEP_H = 3;
  var THUMB_MARGIN = 4;
  var CLEF_X = 3;
  var NOTE_X = 44; // right of the clef, with room left over for a flat/sharp
  var THUMB_WIDTH = 60;

  // Same measured constants staff-view.js's makeStaff uses to land the
  // clef's two dots on the F line (step 6), and to center a sharp
  // glyph vertically (a flat instead hangs from a point near its top,
  // so it just needs a small downward nudge), regardless of font.
  var CLEF_DOT_SPACING_EM = 0.191;
  var CLEF_LOWER_DOT_OFFSET_EM = 0.356;
  var SHARP_CENTER_OFFSET_EM = 0.376;

  // Each thumbnail is sized to its own note, not one shared worst-case
  // box -- the 5 staff lines are always the floor (every thumbnail
  // needs those regardless of pitch), extended only as far as that
  // note's own ledger lines actually require. A pedal tone or the
  // occasional high note gets a taller thumbnail; anything on the
  // staff itself stays compact. scale blows up every dimension
  // together, for callers (the live Build Table reminder) that want a
  // bigger picture than the note-list's own thumbnails.
  function makeThumb(step, accidental, scale) {
    scale = scale || 1;
    var stepH = STEP_H * scale;
    var margin = THUMB_MARGIN * scale;
    var clefX = CLEF_X * scale;
    var noteX = NOTE_X * scale;
    var thumbWidth = THUMB_WIDTH * scale;
    var clefFontSize = (2 * stepH) / CLEF_DOT_SPACING_EM;

    var topStep = Math.max(STAFF_TOP_LINE_STEP, step) + 2;
    var bottomStep = Math.min(STAFF_BOTTOM_LINE_STEP, step) - 2;
    var height = (topStep - bottomStep) * stepH + margin * 2;

    function y(s) { return margin + (topStep - s) * stepH; }

    var svg = el("svg", {
      class: "note-thumb-svg", viewBox: "0 0 " + thumbWidth + " " + height,
      width: thumbWidth, height: height
    });

    for (var s = STAFF_BOTTOM_LINE_STEP; s <= STAFF_TOP_LINE_STEP; s += 2) {
      svg.appendChild(el("line", {
        x1: clefX, y1: y(s), x2: thumbWidth - 2 * scale, y2: y(s),
        stroke: "var(--brass-dim)", "stroke-width": 1
      }));
    }

    svg.appendChild(el("text", {
      x: clefX, y: y(5) + CLEF_LOWER_DOT_OFFSET_EM * clefFontSize,
      "font-size": clefFontSize, fill: "var(--brass)"
    })).textContent = "𝄢";

    var ledgerHalfWidth = 7 * scale;
    var ledgerStep;
    if (step > STAFF_TOP_LINE_STEP) {
      for (ledgerStep = STAFF_TOP_LINE_STEP + 2; ledgerStep <= step; ledgerStep += 2) {
        svg.appendChild(el("line", {
          x1: noteX - ledgerHalfWidth, y1: y(ledgerStep), x2: noteX + ledgerHalfWidth, y2: y(ledgerStep),
          stroke: "var(--brass-dim)", "stroke-width": 1
        }));
      }
    } else if (step < STAFF_BOTTOM_LINE_STEP) {
      for (ledgerStep = STAFF_BOTTOM_LINE_STEP - 2; ledgerStep >= step; ledgerStep -= 2) {
        svg.appendChild(el("line", {
          x1: noteX - ledgerHalfWidth, y1: y(ledgerStep), x2: noteX + ledgerHalfWidth, y2: y(ledgerStep),
          stroke: "var(--brass-dim)", "stroke-width": 1
        }));
      }
    }

    if (accidental === -1 || accidental === 1) {
      var symbol = accidental === -1 ? "♭" : "♯";
      var accFontSize = stepH * 2.2;
      var accY = accidental === 1
        ? y(step) + SHARP_CENTER_OFFSET_EM * accFontSize
        : y(step) + stepH * 0.35;
      svg.appendChild(el("text", {
        x: noteX - stepH * 3, y: accY, "font-size": accFontSize, fill: "var(--brass)"
      })).textContent = symbol;
    }

    svg.appendChild(el("ellipse", {
      cx: noteX, cy: y(step), rx: stepH * 1.15, ry: stepH,
      fill: "var(--brass-bright)"
    }));

    return svg;
  }

  function formatOptions(options) {
    return options
      .slice()
      .sort(function (a, b) { return a.position - b.position; })
      .map(function (o) { return o.position + (o.approximate ? "*" : ""); })
      .join(", ");
  }

  notes.forEach(function (n) {
    var row = document.createElement("tr");

    var thumbCell = document.createElement("td");
    thumbCell.className = "note-thumb-cell";
    thumbCell.appendChild(makeThumb(n.step, n.note.accidental));
    row.appendChild(thumbCell);

    var labelCell = document.createElement("td");
    labelCell.className = "note-name-cell";
    labelCell.textContent = MusicTheory.noteName(n.note);
    row.appendChild(labelCell);

    var positionsCell = document.createElement("td");
    positionsCell.className = "note-positions-cell";
    positionsCell.appendChild(document.createTextNode(formatOptions(n.options)));
    // Only rows that already have a 9th-partial entry are actually at
    // the edge of what's modeled (trombone-positions.js stops there) --
    // an even higher, unmodeled partial could plausibly add one more
    // option to those specifically. Rows with nothing from the 9th
    // partial aren't near that edge, so appending "..." there would
    // claim an uncertainty that isn't real.
    var atModelEdge = n.options.some(function (o) { return o.partial === 9; });
    if (atModelEdge) {
      positionsCell.appendChild(document.createTextNode(", "));
      var ellipsis = document.createElement("span");
      ellipsis.className = "note-positions-ellipsis";
      ellipsis.textContent = "…";
      positionsCell.appendChild(ellipsis);
    }
    row.appendChild(positionsCell);

    tableBody.appendChild(row);
  });

  // ---- Build Table: plays through every position's series live,
  // filling in the position/partial grid above -- the interactive
  // version of "which notes each position can play," with small live
  // tube and staff pictures as a reminder of what's currently sounding
  // (the simplest theory is enough here -- the full bell/horn version
  // lives on harmonic_theory.html).
  var BUILD_MAX_PARTIAL = 8;
  var BUILD_PARTIAL_LABELS = ["Fundamental", "2nd", "3rd", "4th", "5th", "6th", "7th (*slightly flat)", "8th"];
  var BUILD_NOTE_MS = 200;

  var buildTableBtn = document.getElementById("build-table-btn");
  var notesTable = document.getElementById("notes-table");
  var pipeSmallContainer = document.getElementById("pipe-small");
  var staffThumbContainer = document.getElementById("staff-thumb-small");

  var buildCellEls = null;
  var pipeSmall = null;
  var buildPlaying = false;

  function initBuildTable() {
    var head = "<thead><tr><th>Partial</th>";
    for (var position = 1; position <= TrombonePositions.MAX_POSITION; position++) {
      head += "<th>Position " + position + "</th>";
    }
    head += "</tr></thead>";

    // Highest partial on top, fundamental on the bottom row, matching
    // harmonic_theory.html's own table.
    var rows = "";
    for (var i = BUILD_PARTIAL_LABELS.length - 1; i >= 0; i--) {
      rows += "<tr><td>" + BUILD_PARTIAL_LABELS[i] + "</td>";
      for (var p = 0; p < TrombonePositions.MAX_POSITION; p++) rows += "<td></td>";
      rows += "</tr>";
    }
    notesTable.innerHTML = head + "<tbody>" + rows + "</tbody>";

    buildCellEls = [];
    var bodyRows = notesTable.tBodies[0].rows;
    for (var r = 0; r < bodyRows.length; r++) {
      var partialIndex = bodyRows.length - 1 - r;
      var rowCells = bodyRows[r].cells;
      var partialCells = [];
      for (var c = 1; c < rowCells.length; c++) partialCells.push(rowCells[c]);
      buildCellEls[partialIndex] = partialCells;
    }
  }

  var LIVE_THUMB_SCALE = 1.8;

  function updateStaffThumb(step, accidental) {
    staffThumbContainer.innerHTML = "";
    staffThumbContainer.appendChild(makeThumb(step, accidental, LIVE_THUMB_SCALE));
  }

  function renderPipeSmall(position) {
    var tubeLength = TrombonePositions.relativeTubeLength(position);
    var maxTubeLength = TrombonePositions.relativeTubeLength(TrombonePositions.MAX_POSITION);
    var lengthFraction = tubeLength / maxTubeLength;

    if (pipeSmall) pipeSmall.stop();
    pipeSmallContainer.innerHTML = "";
    pipeSmall = Pipe.makePipe(pipeSmallContainer, {
      width: 320, height: 70, lengthFraction: lengthFraction
    });
  }

  async function buildTable() {
    if (buildPlaying) return;
    buildPlaying = true;
    buildTableBtn.disabled = true;
    initBuildTable();

    for (var position = 1; position <= TrombonePositions.MAX_POSITION; position++) {
      renderPipeSmall(position);
      var posSeries = TrombonePositions.naturalHarmonicSeries(BUILD_MAX_PARTIAL, position);
      for (var i = 0; i < posSeries.length; i++) {
        var h = posSeries[i];
        // Same exclusion as the note/positions list above: position 1's
        // 7th partial has no real fix, so it stays blank here too.
        if (position === 1 && h.partial === 7) continue;
        pipeSmall.setHarmonic(h.partial);
        updateStaffThumb(MusicTheory.toBassClefStep(h.note), h.note.accidental);
        playTone(MusicTheory.frequency(h.note), BUILD_NOTE_MS * 0.9);
        buildCellEls[i][position - 1].textContent = MusicTheory.noteName(h.note);
        await sleep(BUILD_NOTE_MS);
      }
    }

    pipeSmall.setHarmonic(null);
    buildPlaying = false;
    buildTableBtn.disabled = false;
  }

  initBuildTable();
  renderPipeSmall(1);
  var restingNote = TrombonePositions.naturalHarmonicSeries(1, 1)[0].note;
  updateStaffThumb(MusicTheory.toBassClefStep(restingNote), restingNote.accidental);

  buildTableBtn.addEventListener("click", buildTable);
})();
