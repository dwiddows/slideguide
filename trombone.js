(function () {
  "use strict";

  // ---- Music data --------------------------------------------------------
  // Bb major scale, one octave, with the slide position each note is
  // conventionally played in (1st position closed, 7th fully extended),
  // and its diatonic step on the bass-clef staff (0 = bottom line, G2;
  // each step = one line or space, so a step of 2 = one staff line).
  // This is the classic beginner scale: Bb on the 2nd line up to Bb in
  // the space above the staff, no ledger lines needed.
  var SCALE = [
    { note: "B♭2", freq: 116.54, position: 1, step: 2 },
    { note: "C3",      freq: 130.81, position: 6, step: 3 },
    { note: "D3",      freq: 146.83, position: 4, step: 4 },
    { note: "E♭3", freq: 155.56, position: 3, step: 5 },
    { note: "F3",      freq: 174.61, position: 1, step: 6 },
    { note: "G3",      freq: 196.00, position: 4, step: 7 },
    { note: "A3",      freq: 220.00, position: 2, step: 8 },
    { note: "B♭3", freq: 233.08, position: 1, step: 9 }
  ];
  var MAX_POSITION = 7;

  // ---- Trombone graphic ---------------------------------------------------
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  var tromboneSvg = document.getElementById("trombone-svg");

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

  var SLIDE_X0 = 120;
  var SLIDE_Y_TOP = 92;
  var SLIDE_Y_BOTTOM = 122;
  var SLIDE_LEN = 160;
  var SLIDE_TRAVEL = 260; // px between position 1 and position 7

  var slide = makeSlide(tromboneSvg, {
    x0: SLIDE_X0, yTop: SLIDE_Y_TOP, yBottom: SLIDE_Y_BOTTOM,
    len: SLIDE_LEN, travel: SLIDE_TRAVEL, maxPosition: MAX_POSITION
  });

  // Position ruler underneath, 1..7 -- a fixed scale to check the
  // slide's travel against.
  for (var p = 1; p <= MAX_POSITION; p++) {
    var rulerX = SLIDE_X0 + (p - 1) / (MAX_POSITION - 1) * SLIDE_TRAVEL;
    tromboneSvg.appendChild(el("line", {
      x1: rulerX, y1: 150, x2: rulerX, y2: 158, stroke: "var(--brass-dim)", "stroke-width": 1
    }));
    var t = el("text", { x: rulerX, y: 172, "text-anchor": "middle", "font-size": 11, fill: "var(--brass-dim)" });
    t.textContent = p;
    tromboneSvg.appendChild(t);
  }
  var rulerLine = el("line", {
    x1: SLIDE_X0, y1: 154, x2: SLIDE_X0 + SLIDE_TRAVEL, y2: 154,
    stroke: "var(--brass-dim)", "stroke-width": 1
  });
  tromboneSvg.appendChild(rulerLine);

  slide.setPosition(1);

  // ---- Staff notation ------------------------------------------------------
  // The order flats appear in a key signature is always B,E,A,D,G,C,F, and
  // each one is placed a 4th above the previous, alternating with a 5th
  // below, starting from wherever "B" naturally sits in the given clef --
  // that's what actually produces the standard zig-zag, so we compute it
  // instead of hardcoding a flat's position for one specific key.
  function keySignatureFlatSteps(count, bStep) {
    var steps = [];
    var step = bStep;
    for (var i = 0; i < count; i++) {
      if (i > 0) step += (i % 2 === 1) ? 3 : -4;
      steps.push(step);
    }
    return steps;
  }

  // Draws a bass-clef staff, its key signature, and a row of notes on it.
  // Kept generic (steps + labels + flat count in, a highlight handle out)
  // so a future version can take an arbitrary user-supplied tune and key.
  function makeStaff(svg, opts) {
    var left = opts.left;
    var right = opts.right;
    var bottomY = opts.bottomY;   // y of the bottom staff line (diatonic step 0)
    var stepH = opts.stepH;       // pixels per diatonic step
    var keyFlats = opts.keyFlats || 0;
    var keyFlatBStep = opts.keyFlatBStep; // where "B" naturally sits in this clef
    var firstNoteX = opts.firstNoteX;
    var noteSpacing = opts.noteSpacing;
    var notes = opts.notes;       // [{ note, step }, ...]
    var noteR = opts.noteR || 7;

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

    // Bass clef, sitting directly on the staff: its two dots straddle the
    // F line (step 6) and the curl wraps around the D line (step 4) below.
    svg.appendChild(el("text", {
      x: left + 6, y: stepToY(2) + stepH * 0.7,
      "font-size": stepH * 6.5, fill: "var(--brass)"
    })).textContent = "𝄢";

    var keyX = left + stepH * 6.5;
    keySignatureFlatSteps(keyFlats, keyFlatBStep).forEach(function (step, i) {
      svg.appendChild(el("text", {
        x: keyX + i * stepH * 1.7, y: stepToY(step) + stepH * 0.35,
        "font-size": stepH * 2.4, fill: "var(--brass)"
      })).textContent = "♭";
    });

    var noteEls = [];
    var labelEls = [];
    notes.forEach(function (n, i) {
      var x = firstNoteX + i * noteSpacing;
      var y = stepToY(n.step);

      // Ledger lines: draw a short line at every line-position (even step)
      // strictly above the staff, up to and including this note's step.
      for (var ls = 10; ls <= n.step; ls += 2) {
        svg.appendChild(el("line", {
          x1: x - 14, y1: stepToY(ls), x2: x + 14, y2: stepToY(ls),
          stroke: "var(--brass-dim)", "stroke-width": 1.5
        }));
      }

      var head = el("ellipse", {
        cx: x, cy: y, rx: noteR, ry: noteR - 1, class: "staff-note"
      });
      svg.appendChild(head);
      noteEls.push(head);

      var label = el("text", {
        x: x, y: y + 34, "text-anchor": "middle", class: "staff-label"
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

  var staffSvg = document.getElementById("staff-svg");
  var staff = makeStaff(staffSvg, {
    left: 60, right: 880, bottomY: 150, stepH: 11,
    keyFlats: 1, keyFlatBStep: 2, // Bb major: one flat, "B" sits on line 2 in bass clef
    firstNoteX: 210, noteSpacing: 95, notes: SCALE
  });

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

  // ---- Playback sequencing ---------------------------------------------------
  var playBtn = document.getElementById("play-btn");
  var tempoSelect = document.getElementById("tempo-select");
  var playing = false;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function playScale() {
    if (playing) return;
    playing = true;
    playBtn.disabled = true;
    var noteMs = parseInt(tempoSelect.value, 10);
    var slideMs = Math.round(noteMs * 0.35);

    for (var i = 0; i < SCALE.length; i++) {
      var n = SCALE[i];
      slide.setPosition(n.position);
      staff.highlightNote(i);
      await sleep(slideMs);
      playTone(n.freq, noteMs - slideMs);
      await sleep(noteMs - slideMs);
    }

    await sleep(150);
    staff.highlightNote(-1);
    slide.setPosition(1);
    playing = false;
    playBtn.disabled = false;
  }

  playBtn.addEventListener("click", playScale);
})();
