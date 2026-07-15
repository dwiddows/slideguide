(function () {
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

  // ---- Trombone graphic ---------------------------------------------------
  // A trombone slide, geometrically, is just two long parallel tubes
  // joined by a U-bend at the far end, held in alignment near the
  // player by a pair of cross braces. Its length never changes as you
  // play -- the whole rigid assembly just slides back and forth.
  //
  // Constructor (opts): where to put it and how big --
  //   svg, x0, yTop, yBottom, len, travel, maxPosition, plus optional
  //   strutGap / strokeWidth / tubeColor / strutColor.
  // Interface: just one thing -- setPosition(position), 1..maxPosition.
  function makeSlide(svg, opts) {
    var x0 = opts.x0;
    var yTop = opts.yTop;
    var yBottom = opts.yBottom;
    var len = opts.len;
    var travel = opts.travel;
    var maxPosition = opts.maxPosition || 7;
    var strutGap = opts.strutGap || 14;
    var strokeWidth = opts.strokeWidth || 7;
    var tubeColor = opts.tubeColor || "var(--brass)";
    var strutColor = opts.strutColor || "var(--brass-dim)";
    var radius = (yBottom - yTop) / 2;

    var group = el("g", {});
    var lineTop = el("line", {
      x1: 0, y1: yTop, x2: len, y2: yTop,
      stroke: tubeColor, "stroke-width": strokeWidth, "stroke-linecap": "round"
    });
    var lineBottom = el("line", {
      x1: 0, y1: yBottom, x2: len, y2: yBottom,
      stroke: tubeColor, "stroke-width": strokeWidth, "stroke-linecap": "round"
    });
    var arc = el("path", {
      d: "M " + len + " " + yTop + " A " + radius + " " + radius + " 0 0 1 " + len + " " + yBottom,
      fill: "none", stroke: tubeColor, "stroke-width": strokeWidth, "stroke-linecap": "round"
    });
    var strut1 = el("line", {
      x1: 0, y1: yTop, x2: 0, y2: yBottom, stroke: strutColor, "stroke-width": strokeWidth - 1
    });
    var strut2 = el("line", {
      x1: strutGap, y1: yTop, x2: strutGap, y2: yBottom,
      stroke: strutColor, "stroke-width": strokeWidth - 1
    });

    group.appendChild(lineTop);
    group.appendChild(lineBottom);
    group.appendChild(arc);
    group.appendChild(strut1);
    group.appendChild(strut2);
    svg.appendChild(group);

    function setPosition(position) {
      var frac = (position - 1) / (maxPosition - 1);
      var offset = x0 + frac * travel;
      group.setAttribute("transform", "translate(" + offset + ", 0)");
    }

    return { setPosition: setPosition };
  }

  // A horizontal strip of position-number labels, one per note, sharing
  // the staff's own pixel coordinate system (noteX) so they line up
  // with the notes above even though this sits far below them, under
  // its own panel. It never scrolls itself -- its scroll offset is
  // driven entirely by mirroring the staff's own scroll position, so
  // it can't drift out of alignment the way two independently
  // scrollable things could.
  // Real trombone notation names a lipped position relative to the
  // NEXT position up, marked with an asterisk (see digitaltrombone.com's
  // alternate-position chart: an asterisk means "place the slide further
  // in than the standard position" -- e.g. their "3*" is between 3rd and
  // 2nd), not as a fraction hanging off the position below -- so 1.75
  // (shortened a quarter position from 2nd to compensate for the flat
  // 7th partial) is "2*", not "1 3/4". Every fractional position here is
  // exactly X.75 (the one correction this app applies), so this only
  // needs to handle that one case.
  function fmtPosition(p) {
    var whole = Math.floor(p);
    return Math.abs(p - whole - 0.75) < 1e-9 ? (whole + 1) + "*" : String(p);
  }
  function makePositionList(container) {
    var wrap = htmlEl("div", { class: "position-list" });
    var inner = htmlEl("div", { class: "position-list-inner" });
    wrap.appendChild(inner);
    container.appendChild(wrap);

    var labelEls = [];

    function setNumbers(positions, noteX) {
      inner.textContent = "";
      labelEls = positions.map(function (p, i) {
        var label = htmlEl("span", { class: "position-list-number" }, fmtPosition(p));
        label.style.left = noteX[i] + "px";
        inner.appendChild(label);
        return label;
      });
      var lastX = noteX.length ? noteX[noteX.length - 1] : 0;
      inner.style.width = (lastX + 40) + "px";
    }

    function setScrollOffset(x) {
      inner.style.transform = "translateX(" + (-x) + "px)";
    }

    function highlightNote(index) {
      labelEls.forEach(function (e, i) { e.classList.toggle("active", i === index); });
    }

    return { setNumbers: setNumbers, setScrollOffset: setScrollOffset, highlightNote: highlightNote };
  }

  var SLIDE_X0 = 120;
  var SLIDE_Y_TOP = 42;
  var SLIDE_Y_BOTTOM = 72;
  var SLIDE_LEN = 220;
  var SLIDE_TRAVEL = 280; // px between position 1 and position 7
  var MAX_POSITION = TrombonePositions.MAX_POSITION;

  function drawPositionRuler(svg) {
    for (var p = 1; p <= MAX_POSITION; p++) {
      var rulerX = SLIDE_X0 + (p - 1) / (MAX_POSITION - 1) * SLIDE_TRAVEL;
      // Ticks on just the upper side of the axis line now (not crossing
      // through it) -- less ink, and a few pixels shorter overall, now
      // that the position-number list is the primary reference and this
      // ruler is more of a background cue.
      svg.appendChild(el("line", {
        x1: rulerX, y1: 100, x2: rulerX, y2: 104, stroke: "var(--brass-dim)", "stroke-width": 1
      }));
      var t = el("text", { x: rulerX, y: 122, "text-anchor": "middle", "font-size": 9, fill: "var(--brass-dim)" });
      t.textContent = p;
      svg.appendChild(t);
    }
    svg.appendChild(el("line", {
      x1: SLIDE_X0, y1: 104, x2: SLIDE_X0 + SLIDE_TRAVEL, y2: 104,
      stroke: "var(--brass-dim)", "stroke-width": 1
    }));
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
      var y = stepToY(n.step);

      // Ledger lines: draw a short line at every line-position (even step)
      // strictly above the staff, up to and including this note's step.
      var ledgerHalfWidth = stepH * 1.27;
      for (var ls = 10; ls <= n.step; ls += 2) {
        svg.appendChild(el("line", {
          x1: x - ledgerHalfWidth, y1: stepToY(ls), x2: x + ledgerHalfWidth, y2: stepToY(ls),
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
      labelEls.forEach(function (e, i) { e.classList.toggle("active", i === index); });
    }

    return { highlightNote: highlightNote };
  }

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
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

  // ---- Scale/arpeggio picker ------------------------------------------------
  // Twelve roots -- no fixed octave. Which octave to start in, and
  // whether a full 2 octaves is even reachable, is computed per
  // root/type below: some keys (Db, D, Eb) genuinely can't fit 2 clean
  // octaves on a trigger-less trombone no matter where you start them.
  var ROOTS = [
    { label: "C", letter: "C", accidental: 0 },
    { label: "D♭", letter: "D", accidental: -1 },
    { label: "D", letter: "D", accidental: 0 },
    { label: "E♭", letter: "E", accidental: -1 },
    { label: "E", letter: "E", accidental: 0 },
    { label: "F", letter: "F", accidental: 0 },
    { label: "F♯", letter: "F", accidental: 1 },
    { label: "G", letter: "G", accidental: 0 },
    { label: "A♭", letter: "A", accidental: -1 },
    { label: "A", letter: "A", accidental: 0 },
    { label: "B♭", letter: "B", accidental: -1 },
    { label: "B", letter: "B", accidental: 0 }
  ];

  // Finds the lowest octave whose one-octave scale/arpeggio is fully
  // playable (clean or approximate), then checks whether a second
  // octave from that same starting point stays fully playable too --
  // if not, this key's 2-octave version would need positions that
  // don't exist on a trigger-less trombone, so it falls back to 1.
  // Melodic minor's descent uses different pitches (natural minor's
  // un-raised 6th/7th) than its ascent, so both need checking here --
  // otherwise an octave whose ascending form is fine could still crash
  // the solver on notes that only appear coming back down.
  function notesToCheck(root, typeKey, octaves) {
    var notes = MusicTheory.buildScale(root, typeKey, octaves);
    if (typeKey === "melodicMinor") {
      notes = notes.concat(MusicTheory.buildScale(root, "naturalMinor", octaves));
    }
    return notes;
  }

  function chooseTune(letter, accidental, typeKey) {
    function reachable(note) {
      return TrombonePositions.positionOptionsForNote(note).length > 0;
    }
    for (var startOctave = 0; startOctave <= 5; startOctave++) {
      var root = { letter: letter, accidental: accidental, octave: startOctave };
      if (notesToCheck(root, typeKey, 1).every(reachable)) {
        var octaves = notesToCheck(root, typeKey, 2).every(reachable) ? 2 : 1;
        return { root: root, octaves: octaves };
      }
    }
    throw new Error("No reachable octave found for " + letter + accidental);
  }

  var TYPES = [
    { key: "major", label: "Major" },
    { key: "naturalMinor", label: "Natural Minor" },
    { key: "harmonicMinor", label: "Harmonic Minor" },
    { key: "melodicMinor", label: "Melodic Minor" },
    { key: "majorArpeggio", label: "Major Arpeggio" },
    { key: "minorArpeggio", label: "Minor Arpeggio" }
  ];

  // Three instantiations of the same solver, each weighting the rules
  // differently -- not three different algorithms.
  var WEIGHT_PRESETS = [
    {
      label: "Closest position",
      note: "prefer the lowest position available",
      weights: { position: 1, positionChange: 0.1, directionChange: 0 }
    },
    {
      label: "Reduced slide travel",
      note: "reduce distance moved",
      weights: { position: 0.15, positionChange: 1, directionChange: 0 }
    },
    {
      label: "Smoothest direction",
      note: "also reduce slide-direction reversals (Arban-style)",
      weights: { position: 0.15, positionExponent: 1.5, positionChange: 0.5, directionChange: 1 }
    }
  ];

  var rootSelect = document.getElementById("root-select");
  var typeSelect = document.getElementById("type-select");
  ROOTS.forEach(function (r, i) {
    rootSelect.appendChild(htmlEl("option", { value: i }, r.label));
  });
  TYPES.forEach(function (t) {
    typeSelect.appendChild(htmlEl("option", { value: t.key }, t.label));
  });
  rootSelect.value = 10; // Bb, matching the widget's original scale
  typeSelect.value = "major";

  // One shared staff (rebuilt per scale, sized to however long that
  // scale turns out to be) plus one trombone per weight preset, each
  // rendered at a fixed 2x pixel size so it stays legible even as
  // panels wrap to their own row on narrower screens.
  var staffSvg = document.getElementById("staff-svg");

  // A 4th, user-editable preset alongside the three fixed ones -- its
  // weights aren't a fixed object like the others, but read live from
  // its own sliders, so visitors can try their own strategy (including
  // deliberately bizarre ones) and see the same trombone react to it
  // in real time. Closed by default (it's the one panel that isn't
  // already a considered position-choice philosophy), while the three
  // fixed presets start open since they're the point of the page.
  var WEIGHT_CONFIGS = [
    { id: "position", label: "Position", hint: "prefer low position numbers", min: 0, max: 2, step: 0.01, value: 0.15 },
    { id: "positionExponent", label: "Position exponent", hint: "1 = linear; above 1 makes 5th-7th cost disproportionately more", min: 1, max: 3, step: 0.05, value: 1.5 },
    { id: "positionChange", label: "Position change", hint: "prefer less total slide travel", min: 0, max: 2, step: 0.01, value: 0.5 },
    { id: "directionChange", label: "Direction change", hint: "prefer fewer slide reversals", min: 0, max: 2, step: 0.01, value: 1 }
  ];

  // Builds the slider block and returns both the DOM to insert and the
  // live inputs, so the caller can read current values and wire up
  // "changed" handling without another DOM query round-trip.
  function buildExpertControls() {
    var container = htmlEl("div", { class: "expert-controls" });
    var inputs = {};
    WEIGHT_CONFIGS.forEach(function (cfg) {
      var label = htmlEl("label");
      var labelSpan = htmlEl("span", { class: "expert-label" }, cfg.label);
      labelSpan.appendChild(htmlEl("span", { class: "expert-hint" }, cfg.hint));
      var input = htmlEl("input", {
        type: "range", min: cfg.min, max: cfg.max, step: cfg.step, value: cfg.value
      });
      var display = htmlEl("span", { class: "expert-value" }, Number(cfg.value).toFixed(2));
      label.appendChild(labelSpan);
      label.appendChild(input);
      label.appendChild(display);
      container.appendChild(label);
      inputs[cfg.id] = { input: input, display: display };
    });
    return { element: container, inputs: inputs };
  }

  var expertControls = buildExpertControls();
  function customWeights() {
    var weights = {};
    WEIGHT_CONFIGS.forEach(function (cfg) {
      weights[cfg.id] = Number(expertControls.inputs[cfg.id].input.value);
    });
    return weights;
  }
  var CUSTOM_PRESET = {
    label: "Set Your Own Policy",
    note: "try your own strategy",
    isCustom: true,
    getWeights: customWeights
  };

  var panelsContainer = document.getElementById("panels");
  var panels = WEIGHT_PRESETS.concat([CUSTOM_PRESET]).map(function (preset) {
    var details = htmlEl("details", { class: "panel-details" });
    if (!preset.isCustom) details.setAttribute("open", "");

    var summary = htmlEl("summary");
    summary.appendChild(htmlEl("h2", {}, preset.label));
    summary.appendChild(htmlEl("span", { class: "panel-note" }, preset.note));
    details.appendChild(summary);

    var body = htmlEl("div", { class: "panel-body" });
    if (preset.isCustom) body.appendChild(expertControls.element);
    var positionList = makePositionList(body);
    var tromboneSvg = el("svg", {
      class: "trombone-svg", viewBox: "0 0 900 150", width: "1800", height: "300"
    });
    body.appendChild(tromboneSvg);
    details.appendChild(body);
    panelsContainer.appendChild(details);

    var slide = makeSlide(tromboneSvg, {
      x0: SLIDE_X0, yTop: SLIDE_Y_TOP, yBottom: SLIDE_Y_BOTTOM,
      len: SLIDE_LEN, travel: SLIDE_TRAVEL, maxPosition: MAX_POSITION
    });
    drawPositionRuler(tromboneSvg);
    slide.setPosition(1);

    return { preset: preset, slide: slide, positionList: positionList, positions: [] };
  });

  // ---- Wiring the picker to the panels ---------------------------------------
  // durations are in "quarter notes" (a generated scale/arpeggio is just
  // a uniform run of them; a loaded melody's real rhythm, from ABC's own
  // fraction-of-a-whole-note units divided by a quarter, lands on the
  // same scale) -- one shared unit for both staff spacing and playback timing.
  var QUARTER_NOTE = 0.25;
  var currentNotes = [];
  var currentDurations = [];
  var staffHandle = null;
  var staffScroll = document.getElementById("staff-scroll");
  var layout = { noteX: [] };

  // Each panel's position-number list mirrors the staff's own scroll
  // position exactly (rather than scrolling independently) so it can
  // never drift out of alignment with the noteX coordinates it shares.
  // This fires for both user-dragged scrolling and the programmatic
  // scrollLeft assignments during playback (scrollStaffToNote below) --
  // native scroll events cover both, no separate call needed there.
  staffScroll.addEventListener("scroll", function () {
    panels.forEach(function (panel) {
      panel.positionList.setScrollOffset(staffScroll.scrollLeft);
    });
  });

  // The staff stays put -- no distracting motion right from the start --
  // until the playing note would reach the middle of the visible area,
  // at which point it holds the note there, scrolling to keep up.
  function scrollStaffToNote(i) {
    var middle = staffScroll.clientWidth / 2;
    var maxScroll = Math.max(0, staffSvg.width.baseVal.value - staffScroll.clientWidth);
    staffScroll.scrollLeft = Math.max(0, Math.min(maxScroll, layout.noteX[i] - middle));
  }

  // Shared by both tune sources (the root/type picker and a loaded ABC
  // melody): lays out the staff and re-solves every panel for whatever
  // notes+durations+key signature it's handed.
  function renderTune(notes, durations, keySig) {
    currentNotes = notes;
    currentDurations = durations;
    var staffNotes = currentNotes.map(function (n) {
      return {
        note: MusicTheory.noteName(n), step: MusicTheory.toBassClefStep(n),
        letter: n.letter, accidental: n.accidental, octave: n.octave
      };
    });

    // Sized to fit however tall and long *this* tune actually is: two
    // octaves from a high root reaches well above the staff, and up-and-
    // down doubles the note count, so neither dimension is fixed.
    // Scaled to 2/3 overall on a normal screen -- this is just showing
    // obvious scales, more a mnemonic than something that needs to be
    // fully readable. Smaller still on a narrow phone screen, where the
    // staff would otherwise dominate the page over the trombone graphics
    // (which have their own legibility floor -- see .trombone-svg's
    // min-width -- so they don't shrink to match).
    var STAFF_SCALE = window.innerWidth < 600 ? 0.45 : 2 / 3;
    var stepH = 11 * STAFF_SCALE;
    var margin = 40 * STAFF_SCALE;
    var left = 60 * STAFF_SCALE;
    var rightMargin = 20 * STAFF_SCALE;
    var maxStep = Math.max.apply(null, staffNotes.map(function (n) { return n.step; }));
    var bottomY = maxStep * stepH + margin;
    var staffHeight = bottomY + margin;

    // Each note's width on the page is proportional to its own duration
    // (a half note takes up twice the room a quarter note does), so a
    // loaded melody's rhythm is visible in the spacing, not just audible.
    var baseSpacing = 55 * STAFF_SCALE;
    var noteX = [170 * STAFF_SCALE];
    for (var i = 1; i < currentNotes.length; i++) {
      noteX.push(noteX[i - 1] + baseSpacing * (currentDurations[i - 1] / QUARTER_NOTE));
    }
    layout.noteX = noteX;
    var lastWidth = baseSpacing * (currentDurations[currentDurations.length - 1] / QUARTER_NOTE);
    var staffWidth = noteX[noteX.length - 1] + lastWidth + margin;
    staffSvg.setAttribute("viewBox", "0 0 " + staffWidth + " " + staffHeight);
    staffSvg.setAttribute("width", staffWidth);
    staffSvg.setAttribute("height", staffHeight);

    clearSvg(staffSvg);
    staffHandle = makeStaff(staffSvg, {
      left: left, right: staffWidth - rightMargin, bottomY: bottomY, stepH: stepH,
      keyFlats: keySig.flats, keyFlatBStep: 2,
      keySharps: keySig.sharps, keySharpFStep: 6,
      noteX: noteX, notes: staffNotes
    });
    staffScroll.scrollLeft = 0;

    panels.forEach(function (panel) {
      var weights = panel.preset.getWeights ? panel.preset.getWeights() : panel.preset.weights;
      var solved = Solver.solve(currentNotes, TrombonePositions.positionOptionsForNote, weights);
      panel.positions = solved.positions;
      panel.slide.setPosition(panel.positions[0]);
      panel.positionList.setNumbers(panel.positions, noteX);
      panel.positionList.setScrollOffset(0);
    });
  }

  function render() {
    var r = ROOTS[Number(rootSelect.value)];
    var typeKey = typeSelect.value;
    var tune = chooseTune(r.letter, r.accidental, typeKey);
    var notes = typeKey === "melodicMinor"
      ? MusicTheory.buildMelodicMinorFull(tune.root, tune.octaves)
      : MusicTheory.ascendingAndDescending(MusicTheory.buildScale(tune.root, typeKey, tune.octaves));
    var durations = notes.map(function () { return QUARTER_NOTE; });
    renderTune(notes, durations, MusicTheory.keySignature(tune.root, typeKey));
  }

  rootSelect.addEventListener("change", render);
  typeSelect.addEventListener("change", render);

  // ---- Loading a melody from typed-in ABC notation ---------------------------
  // Reuses the exact same renderTune pipeline as the root/type picker --
  // an ABC melody's key signature comes from its own K: field (via
  // AbcImport), not from MusicTheory.keySignature, since it isn't
  // necessarily one of the scales/arpeggios this app generates.
  //
  // There's no separate "load" step or button: clicking into the text
  // box immediately shows what's already typed there on the staff (in
  // case the scale picker was the last thing shown), and editing it
  // keeps that live -- the staff always shows whichever of the two
  // inputs (this box, or the root/type picker) was touched most
  // recently, and the single Play button below just plays that.
  var melodyInput = document.getElementById("melody-input");
  var melodyError = document.getElementById("melody-error");

  function loadMelody() {
    melodyError.textContent = "";
    var parsed;
    try {
      parsed = AbcImport.parseAbcMelody(melodyInput.value);
    } catch (e) {
      melodyError.textContent = e.message;
      return;
    }
    // Checked up front, before touching the staff/panels: a melody with
    // even one note outside this trigger-less horn's range would
    // otherwise leave the display mid-update when Solver.solve throws.
    var unplayable = parsed.notes.filter(function (n) {
      return TrombonePositions.positionOptionsForNote(n).length === 0;
    });
    if (unplayable.length > 0) {
      melodyError.textContent = "This melody goes outside the trombone's playable range at " +
        unplayable.map(MusicTheory.noteName).join(", ") + ".";
      return;
    }
    renderTune(parsed.notes, parsed.durations, parsed.keySignature);
  }

  // Typing fires on every keystroke, which would otherwise re-parse
  // (and flash parse errors) mid-word -- debounced so it only re-renders
  // once typing actually pauses.
  var melodyInputTimer = null;
  melodyInput.addEventListener("focus", loadMelody);
  melodyInput.addEventListener("input", function () {
    clearTimeout(melodyInputTimer);
    melodyInputTimer = setTimeout(loadMelody, 400);
  });

  // Defaults to the melody box rather than the scale picker on load --
  // just for this week (World Cup!); swap back to render() here to
  // return to defaulting on the scale picker.
  loadMelody();

  // ---- Custom-weight sliders --------------------------------------------------
  // Dragging a slider only needs to re-solve and reposition the one
  // custom-weight trombone, not rebuild the whole staff -- that keeps it
  // responsive while dragging, and leaves the staff scroll position alone.
  var customPanel = panels[panels.length - 1];
  function updateCustomPanel() {
    var solved = Solver.solve(currentNotes, TrombonePositions.positionOptionsForNote, customWeights());
    customPanel.positions = solved.positions;
    customPanel.slide.setPosition(customPanel.positions[0]);
    customPanel.positionList.setNumbers(customPanel.positions, layout.noteX);
    customPanel.positionList.setScrollOffset(staffScroll.scrollLeft);
  }
  WEIGHT_CONFIGS.forEach(function (cfg) {
    var pair = expertControls.inputs[cfg.id];
    pair.input.addEventListener("input", function () {
      pair.display.textContent = Number(pair.input.value).toFixed(2);
      updateCustomPanel();
    });
  });

  // ---- Playback sequencing ---------------------------------------------------
  // One shared clock drives all three panels (same pitches, same timing --
  // only the position choice differs), and audio plays once, not 3x.
  // One Play button, one tempo, always playing whatever renderTune most
  // recently put on the staff.
  var playBtn = document.getElementById("play-btn");
  var tempoSelect = document.getElementById("tempo-select");
  var tempoValue = document.getElementById("tempo-value");
  tempoSelect.addEventListener("input", function () {
    tempoValue.textContent = tempoSelect.value;
  });
  var playing = false;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function playAll() {
    if (playing) return;
    playing = true;
    playBtn.disabled = true;
    // The slider is a real BPM value (quarter notes per minute, the
    // usual convention), converted straight to milliseconds per quarter.
    var quarterMs = 60000 / Number(tempoSelect.value);

    for (var i = 0; i < currentNotes.length; i++) {
      var noteMs = Math.round(quarterMs * (currentDurations[i] / QUARTER_NOTE));
      var slideMs = Math.round(noteMs * 0.35);
      panels.forEach(function (panel) {
        panel.slide.setPosition(panel.positions[i]);
        panel.positionList.highlightNote(i);
      });
      staffHandle.highlightNote(i);
      scrollStaffToNote(i);
      await sleep(slideMs);
      playTone(MusicTheory.frequency(currentNotes[i]), noteMs - slideMs);
      await sleep(noteMs - slideMs);
    }

    await sleep(150);
    staffScroll.scrollLeft = 0;
    staffHandle.highlightNote(-1);
    panels.forEach(function (panel) {
      panel.slide.setPosition(panel.positions[0]);
      panel.positionList.highlightNote(-1);
    });
    playing = false;
    playBtn.disabled = false;
  }

  playBtn.addEventListener("click", playAll);
})();
