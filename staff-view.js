/**
 * Shared staff-notation rendering and tone playback -- factored out of
 * trombone.js once theory.html needed the exact same bass-clef staff
 * and note-playing sound trombone.js already had, so neither page has
 * to keep its own copy of this in sync with the other.
 *
 * Browser-only (DOM/AudioContext): the dual-module wrapper below is
 * only for load-time consistency with this project's other files --
 * everything it exports still needs a real document/AudioContext to
 * actually call.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./music-theory.js"));
  } else {
    root.StaffView = factory(root.MusicTheory);
  }
})(typeof self !== "undefined" ? self : this, function (MusicTheory) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function htmlEl(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  // A horizontal strip of small labels, one per note, sharing the
  // staff's own pixel coordinate system (noteX) so they line up with
  // the notes above even though this sits in its own container below
  // them -- a row of trombone slide positions under one page's staff,
  // a row of harmonic partial numbers under another's. It never
  // scrolls itself -- callers mirror whatever scrolls the staff into
  // setScrollOffset, so it can't drift out of alignment the way two
  // independently scrollable elements could.
  // Built as SVG text rather than HTML+CSS-transform, deliberately --
  // that's the exact same coordinate pipeline the staff notes use
  // (an SVG with viewBox matching its own pixel width 1:1), so there's
  // no risk of two different rendering technologies (SVG geometry vs.
  // CSS box layout) rounding sub-pixel positions differently under an
  // unusual zoom level or display scaling factor.
  function makeNumberRow(container, opts) {
    var format = (opts && opts.format) || String;
    var wrapClass = (opts && opts.wrapClass) || "position-list";
    var wrap = htmlEl("div", { class: wrapClass });
    var svg = el("svg", { class: "position-list-svg", height: "20" });
    wrap.appendChild(svg);
    container.appendChild(wrap);

    var textEls = [];

    function setNumbers(values, noteX) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var lastX = noteX.length ? noteX[noteX.length - 1] : 0;
      var width = lastX + 40;
      svg.setAttribute("width", width);
      svg.setAttribute("viewBox", "0 0 " + width + " 20");
      // A null value (a rest, on the trombone page -- nothing else
      // uses this yet) just leaves a gap in the row, same as the staff.
      textEls = values.map(function (v, i) {
        if (v === null) return null;
        var t = el("text", {
          x: noteX[i], y: 15, "text-anchor": "middle", class: "position-list-number"
        });
        t.textContent = format(v);
        svg.appendChild(t);
        return t;
      });
    }

    function setScrollOffset(x) {
      svg.style.transform = "translateX(" + (-x) + "px)";
    }

    function highlightNote(index) {
      textEls.forEach(function (e, i) { if (e) e.classList.toggle("active", i === index); });
    }

    return { setNumbers: setNumbers, setScrollOffset: setScrollOffset, highlightNote: highlightNote };
  }

  // ---- Staff notation ------------------------------------------------------
  // Draws a bass-clef staff, its key signature, and a row of notes on it.
  // Kept generic (steps + labels + flat count in, a highlight handle out)
  // so it can be handed any generated tune and key, not just one scale.
  function makeStaff(svg, opts) {
    var left = opts.left;
    var right = opts.right;
    var bottomY = opts.bottomY;   // y of the bottom staff line (diatonic step 0)
    var stepH = opts.stepH;       // pixels per diatonic step
    var keyFlats = opts.keyFlats || 0;
    var keyFlatBStep = opts.keyFlatBStep; // where "B" naturally sits in this clef
    var keySharps = opts.keySharps || 0;
    var keySharpFStep = opts.keySharpFStep; // where "F" naturally sits in this clef
    var noteX = opts.noteX;       // pixel x for each note, already spaced by duration
    var notes = opts.notes;       // [{ note, step }, ...]
    var noteR = opts.noteR || stepH * 0.64;

    function stepToY(step) {
      return bottomY - step * stepH;
    }

    // Five staff lines: steps 0,2,4,6,8
    for (var s = 0; s <= 8; s += 2) {
      svg.appendChild(el("line", {
        x1: left, y1: stepToY(s), x2: right, y2: stepToY(s),
        stroke: "var(--brass-dim)", "stroke-width": 1.5
      }));
    }

    // Bass clef. The U+1D122 glyph's own two dots are meant to straddle
    // the F line (step 6), but where they actually land depends on the
    // font -- so these constants are measured directly from how the
    // glyph renders (Apple Symbols, the usual fallback for this
    // character), not guessed: the dots sit 0.191em apart vertically,
    // and the lower one sits 0.356em above the baseline. Solving for
    // the font-size and baseline that put those dots exactly on steps
    // 5 and 7 (one space below/above the F line) gives:
    var CLEF_DOT_SPACING_EM = 0.191;
    var CLEF_LOWER_DOT_OFFSET_EM = 0.356;
    var clefFontSize = (2 * stepH) / CLEF_DOT_SPACING_EM;
    var clefBaselineY = stepToY(5) + CLEF_LOWER_DOT_OFFSET_EM * clefFontSize;
    svg.appendChild(el("text", {
      x: left + 6, y: clefBaselineY,
      "font-size": clefFontSize, fill: "var(--brass)"
    })).textContent = "𝄢";

    var keyX = left + 6 + clefFontSize * 0.62;
    var keySymbolCount = keyFlats + keySharps; // a real key has one or the other, never both
    MusicTheory.keySignatureFlatSteps(keyFlats, keyFlatBStep).forEach(function (step, i) {
      svg.appendChild(el("text", {
        x: keyX + i * stepH * 1.7, y: stepToY(step) + stepH * 0.35,
        "font-size": stepH * 2.4, fill: "var(--brass)"
      })).textContent = "♭";
    });
    // The ♯ glyph is visually centered on its own middle (unlike ♭,
    // which hangs from a point near its top), measured at 0.376em
    // above the baseline to the glyph's vertical center -- so, to land
    // that center exactly on the target step:
    var SHARP_CENTER_OFFSET_EM = 0.376;
    var sharpFontSize = stepH * 2.4;
    MusicTheory.keySignatureSharpSteps(keySharps, keySharpFStep).forEach(function (step, i) {
      svg.appendChild(el("text", {
        x: keyX + i * stepH * 1.7, y: stepToY(step) + SHARP_CENTER_OFFSET_EM * sharpFontSize,
        "font-size": sharpFontSize, fill: "var(--brass)"
      })).textContent = "♯";
    });

    // Busier keys (more flats/sharps) need the notes pushed further
    // right so a 5-accidental signature doesn't collide with the first
    // note -- noteX's own first entry is a minimum, not a fixed position,
    // so the whole (already duration-spaced) sequence shifts right together.
    var keySymbolsEndX = keySymbolCount > 0
      ? keyX + (keySymbolCount - 1) * stepH * 1.7 + stepH * 2.2
      : keyX;
    var shift = Math.max(0, keySymbolsEndX - noteX[0]);
    if (shift > 0) noteX = noteX.map(function (x) { return x + shift; });

    // A harmonic/melodic minor's altered degrees (e.g. a raised 7th)
    // aren't part of the key signature at all -- that only ever carries
    // the relative major's flats/sharps -- so whenever a note returns
    // to (or departs from) what the signature implies for its pitch, it
    // needs an explicit accidental of its own. There's no barline here
    // to reset that per measure, so once shown, an accidental holds for
    // that exact pitch until something actually changes it again --
    // computed once up front so each note only needs its own answer.
    var keySig = { flats: keyFlats, sharps: keySharps };
    var accidentalsToShow = MusicTheory.accidentalsToDisplay(notes, keySig);
    var accidentalFontSize = stepH * 2.2;

    var noteEls = [];
    var labelEls = [];
    notes.forEach(function (n, i) {
      var x = noteX[i];

      // A rest has no pitch, no ledger lines, no accidental, and no
      // note-name label -- just a glyph floating around the middle
      // line, the conventional spot regardless of the rest's own
      // duration (this staff is a mnemonic, not full engraving, so one
      // glyph for every rest length is enough).
      if (n === null) {
        var restGlyph = el("text", {
          x: x, y: stepToY(4) + stepH * 0.4, "text-anchor": "middle",
          "font-size": stepH * 2.2, class: "staff-note"
        });
        restGlyph.textContent = "𝄽";
        svg.appendChild(restGlyph);
        noteEls.push(restGlyph);
        labelEls.push(null);
        return;
      }

      var y = stepToY(n.step);

      // Ledger lines: draw a short line at every line-position (even step)
      // strictly above the staff, up to and including this note's step --
      // and the mirror image below the staff, for notes low enough to
      // need it (the harmonic series' own pedal tone, for one).
      var ledgerHalfWidth = stepH * 1.27;
      for (var ls = 10; ls <= n.step; ls += 2) {
        svg.appendChild(el("line", {
          x1: x - ledgerHalfWidth, y1: stepToY(ls), x2: x + ledgerHalfWidth, y2: stepToY(ls),
          stroke: "var(--brass-dim)", "stroke-width": 1.5
        }));
      }
      for (var lsBelow = -2; lsBelow >= n.step; lsBelow -= 2) {
        svg.appendChild(el("line", {
          x1: x - ledgerHalfWidth, y1: stepToY(lsBelow), x2: x + ledgerHalfWidth, y2: stepToY(lsBelow),
          stroke: "var(--brass-dim)", "stroke-width": 1.5
        }));
      }

      var accidentalToShow = accidentalsToShow[i];
      if (accidentalToShow !== null) {
        // Rare, but real: a key whose signature already flats/sharps a
        // letter can need that same letter raised or lowered by a
        // further semitone (e.g. Db harmonic minor's 6th degree is Bbb,
        // a double flat), not just the usual single accidental.
        var symbol = accidentalToShow === -2 ? "𝄫" : accidentalToShow === -1 ? "♭" :
          accidentalToShow === 1 ? "♯" : accidentalToShow === 2 ? "𝄪" : "♮";
        var isSharpish = symbol === "♯" || symbol === "𝄪";
        var accY = (isSharpish ? y + SHARP_CENTER_OFFSET_EM * accidentalFontSize : y + stepH * 0.35) + stepH * 0.4;
        svg.appendChild(el("text", {
          x: x - stepH * 3, y: accY, "font-size": accidentalFontSize, fill: "var(--brass)"
        })).textContent = symbol;
      }

      var head = el("ellipse", {
        cx: x, cy: y, rx: noteR, ry: noteR - 1, class: "staff-note"
      });
      svg.appendChild(head);
      noteEls.push(head);

      var label = el("text", {
        x: x, y: y + stepH * 3.1, "text-anchor": "middle", "font-size": stepH * 1.18, class: "staff-label"
      });
      label.textContent = n.note;
      svg.appendChild(label);
      labelEls.push(label);
    });

    function highlightNote(index) {
      noteEls.forEach(function (e, i) { e.classList.toggle("active", i === index); });
      labelEls.forEach(function (e, i) { if (e) e.classList.toggle("active", i === index); });
    }

    return { highlightNote: highlightNote };
  }

  // ---- Audio ----------------------------------------------------------------
  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(freq, durationMs) {
    var ctx = ensureAudio();
    var now = ctx.currentTime;
    var dur = durationMs / 1000;

    var osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq * 5.5;
    filter.Q.value = 0.7;

    var gain = ctx.createGain();
    var peak = 0.28;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.03);
    gain.gain.setValueAtTime(peak, now + Math.max(dur - 0.09, 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // A live-controllable tone for dragging a slider, rather than
  // playTone's fire-and-forget fixed-duration note: starts silent,
  // stays running, and setFrequency/setGain glide smoothly to whatever
  // value is set next (setTargetAtTime, not a hard jump -- avoiding the
  // clicks a sudden frequency/gain change would otherwise cause).
  function makeContinuousTone() {
    var ctx = ensureAudio();
    var osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 220;

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.value = 220 * 5.5;

    var gain = ctx.createGain();
    gain.gain.value = 0;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    function setFrequency(freq) {
      osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.015);
      filter.frequency.setTargetAtTime(freq * 5.5, ctx.currentTime, 0.015);
    }
    function setGain(g) {
      gain.gain.setTargetAtTime(g, ctx.currentTime, 0.04);
    }

    return { setFrequency: setFrequency, setGain: setGain };
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  return {
    el: el,
    htmlEl: htmlEl,
    clearSvg: clearSvg,
    makeStaff: makeStaff,
    makeNumberRow: makeNumberRow,
    playTone: playTone,
    makeContinuousTone: makeContinuousTone,
    sleep: sleep
  };
});
