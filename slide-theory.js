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
  var NOTE_X = 36; // right of the clef, shared by staff lines' ledger extension too
  var THUMB_WIDTH = 50;

  // Same measured constants staff-view.js's makeStaff uses to land the
  // clef's two dots on the F line (step 6) regardless of font.
  var CLEF_DOT_SPACING_EM = 0.191;
  var CLEF_LOWER_DOT_OFFSET_EM = 0.356;
  var clefFontSize = (2 * STEP_H) / CLEF_DOT_SPACING_EM;

  // Each thumbnail is sized to its own note, not one shared worst-case
  // box -- the 5 staff lines are always the floor (every thumbnail
  // needs those regardless of pitch), extended only as far as that
  // note's own ledger lines actually require. A pedal tone or the
  // occasional high note gets a taller thumbnail; anything on the
  // staff itself stays compact.
  function makeThumb(step) {
    var topStep = Math.max(STAFF_TOP_LINE_STEP, step) + 2;
    var bottomStep = Math.min(STAFF_BOTTOM_LINE_STEP, step) - 2;
    var height = (topStep - bottomStep) * STEP_H + THUMB_MARGIN * 2;

    function y(s) { return THUMB_MARGIN + (topStep - s) * STEP_H; }

    var svg = el("svg", {
      class: "note-thumb-svg", viewBox: "0 0 " + THUMB_WIDTH + " " + height,
      width: THUMB_WIDTH, height: height
    });

    for (var s = STAFF_BOTTOM_LINE_STEP; s <= STAFF_TOP_LINE_STEP; s += 2) {
      svg.appendChild(el("line", {
        x1: CLEF_X, y1: y(s), x2: THUMB_WIDTH - 2, y2: y(s),
        stroke: "var(--brass-dim)", "stroke-width": 1
      }));
    }

    svg.appendChild(el("text", {
      x: CLEF_X, y: y(5) + CLEF_LOWER_DOT_OFFSET_EM * clefFontSize,
      "font-size": clefFontSize, fill: "var(--brass)"
    })).textContent = "𝄢";

    var ledgerHalfWidth = 7;
    var ledgerStep;
    if (step > STAFF_TOP_LINE_STEP) {
      for (ledgerStep = STAFF_TOP_LINE_STEP + 2; ledgerStep <= step; ledgerStep += 2) {
        svg.appendChild(el("line", {
          x1: NOTE_X - ledgerHalfWidth, y1: y(ledgerStep), x2: NOTE_X + ledgerHalfWidth, y2: y(ledgerStep),
          stroke: "var(--brass-dim)", "stroke-width": 1
        }));
      }
    } else if (step < STAFF_BOTTOM_LINE_STEP) {
      for (ledgerStep = STAFF_BOTTOM_LINE_STEP - 2; ledgerStep >= step; ledgerStep -= 2) {
        svg.appendChild(el("line", {
          x1: NOTE_X - ledgerHalfWidth, y1: y(ledgerStep), x2: NOTE_X + ledgerHalfWidth, y2: y(ledgerStep),
          stroke: "var(--brass-dim)", "stroke-width": 1
        }));
      }
    }

    svg.appendChild(el("ellipse", {
      cx: NOTE_X, cy: y(step), rx: STEP_H * 1.15, ry: STEP_H,
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
    thumbCell.appendChild(makeThumb(n.step));
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
})();
