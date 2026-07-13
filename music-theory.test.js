/**
 * Plain-Node unit tests, no framework: run with `node music-theory.test.js`.
 * Exits non-zero if anything fails, so it's CI-friendly later too.
 */
var MusicTheory = require("./music-theory.js");
var TrombonePositions = require("./trombone-positions.js");

var failures = 0;
var passes = 0;

function assert(condition, message) {
  if (condition) {
    passes++;
  } else {
    failures++;
    console.error("FAIL: " + message);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message + " (got " + actual + ", expected " + expected + ")");
}

function assertClose(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance,
    message + " (got " + actual + ", expected ~" + expected + ")");
}

function names(notes) {
  return notes.map(MusicTheory.noteName);
}

// ---- Bb major, starting Bb2 -- this is the scale the trombone widget
// already plays, hand-verified against standard 12-TET frequency
// tables, so it's a solid regression anchor. ----------------------------
(function () {
  var bb2 = { letter: "B", accidental: -1, octave: 2 };
  var scale = MusicTheory.buildScale(bb2, "major");

  assertEqual(scale.length, 8, "Bb major: 8 notes (7 + octave)");
  assertEqual(names(scale).join(","), "B♭2,C3,D3,E♭3,F3,G3,A3,B♭3",
    "Bb major: correct letter spelling (flats, not sharps)");

  var expectedFreqs = [116.54, 130.81, 146.83, 155.56, 174.61, 196.00, 220.00, 233.08];
  scale.forEach(function (note, i) {
    assertClose(MusicTheory.frequency(note), expectedFreqs[i], 0.02,
      "Bb major note " + i + " (" + MusicTheory.noteName(note) + ") frequency");
  });

  var expectedSteps = [2, 3, 4, 5, 6, 7, 8, 9];
  scale.forEach(function (note, i) {
    assertEqual(MusicTheory.toBassClefStep(note), expectedSteps[i],
      "Bb major note " + i + " bass-clef step");
  });

  var sig = MusicTheory.keySignature(bb2, "major");
  assertEqual(sig.flats, 2, "Bb major key signature: 2 flats (Bb, Eb)");
  assertEqual(sig.sharps, 0, "Bb major key signature: 0 sharps");
})();

// ---- F major -- also one flat, but a different flat (Bb, not B),
// and the whole scale should read as the natural letter sequence
// F,G,A,Bb,C,D,E,F rather than drifting into sharps. --------------------
(function () {
  var f3 = { letter: "F", accidental: 0, octave: 3 };
  var scale = MusicTheory.buildScale(f3, "major");

  assertEqual(names(scale).join(","), "F3,G3,A3,B♭3,C4,D4,E4,F4",
    "F major: correct letter spelling");

  var sig = MusicTheory.keySignature(f3, "major");
  assertEqual(sig.flats, 1, "F major key signature: 1 flat");
  assertEqual(sig.sharps, 0, "F major key signature: 0 sharps");
})();

// ---- Bb major an octave higher -- same spelling, everything shifted
// up 7 diatonic steps and every frequency exactly doubled. --------------
(function () {
  var bb2 = { letter: "B", accidental: -1, octave: 2 };
  var bb3 = { letter: "B", accidental: -1, octave: 3 };
  var lower = MusicTheory.buildScale(bb2, "major");
  var higher = MusicTheory.buildScale(bb3, "major");

  assertEqual(names(higher).join(","), "B♭3,C4,D4,E♭4,F4,G4,A4,B♭4",
    "Bb major +8ve: correct letter spelling");

  lower.forEach(function (note, i) {
    assertClose(MusicTheory.frequency(higher[i]), MusicTheory.frequency(note) * 2, 0.01,
      "Bb major +8ve note " + i + " is exactly double the frequency");
    assertEqual(MusicTheory.toBassClefStep(higher[i]), MusicTheory.toBassClefStep(note) + 7,
      "Bb major +8ve note " + i + " is 7 staff-steps higher");
  });
})();

// ---- A natural minor -- the relative minor of C major, so it should
// have no accidentals and no key signature at all. ----------------------
(function () {
  var a3 = { letter: "A", accidental: 0, octave: 3 };
  var scale = MusicTheory.buildScale(a3, "naturalMinor");

  assertEqual(names(scale).join(","), "A3,B3,C4,D4,E4,F4,G4,A4",
    "A natural minor: all-natural spelling");

  var sig = MusicTheory.keySignature(a3, "naturalMinor");
  assertEqual(sig.flats, 0, "A minor key signature: 0 flats");
  assertEqual(sig.sharps, 0, "A minor key signature: 0 sharps");
})();

// ---- D harmonic minor -- shares F major's 1-flat key signature (its
// relative major), but raises the 7th degree (C -> C#) as a one-off
// accidental that is NOT part of that key signature. --------------------
(function () {
  var d3 = { letter: "D", accidental: 0, octave: 3 };
  var scale = MusicTheory.buildScale(d3, "harmonicMinor");

  assertEqual(names(scale).join(","), "D3,E3,F3,G3,A3,B♭3,C♯4,D4",
    "D harmonic minor: raised 7th (C#), flat 6th (Bb)");

  var sig = MusicTheory.keySignature(d3, "harmonicMinor");
  assertEqual(sig.flats, 1, "D harmonic minor key signature: 1 flat (from F major, its relative major)");
  assertEqual(sig.sharps, 0, "D harmonic minor key signature: 0 sharps (the C# is a written accidental, not in the signature)");

  // The signature covers B (flatted), but says nothing about C -- so the
  // raised 7th (C#) needs its own accidental every time it's written.
  assertEqual(MusicTheory.keySignatureAccidentalForLetter(sig, "B"), -1,
    "D harmonic minor: the key signature itself flats B");
  assertEqual(MusicTheory.keySignatureAccidentalForLetter(sig, "C"), 0,
    "D harmonic minor: the key signature says nothing about C, so C# needs a written accidental");
})();

// ---- accidentalsToDisplay: there's no barline in this notation to
// reset an accidental each measure, so a written accidental holds for
// its exact pitch (letter+octave) until something actually changes it
// again -- however much later that is, and even if the new value
// happens to match the key signature's own default. Melodic minor's
// descending 6th/7th are the clearest real case: they're the same
// letters just raised moments earlier, so a reader needs an explicit
// mark to see they're back down, even though nothing about the key
// signature itself changed. ---------------------------------------------
(function () {
  var d3 = { letter: "D", accidental: 0, octave: 3 };
  var notes = MusicTheory.buildMelodicMinorFull(d3, 1);
  var sig = MusicTheory.keySignature(d3, "melodicMinor");
  var marks = MusicTheory.accidentalsToDisplay(notes, sig);

  assertEqual(names(notes).join(","), "D3,E3,F3,G3,A3,B3,C♯4,D4,C4,B♭3,A3,G3,F3,E3,D3",
    "D melodic minor: raised 6th/7th ascending, natural 6th/7th descending");

  // Ascending: ascending B and C# both differ from the 1-flat signature's
  // defaults (flat B, natural C), so both need a written accidental.
  assertEqual(marks[5], 0, "D melodic minor: ascending B natural needs a natural sign (signature flats B)");
  assertEqual(marks[6], 1, "D melodic minor: ascending C# needs a sharp");

  // Descending: C natural and Bb both match the *key signature's* own
  // defaults exactly -- but each was just shown altered a couple of
  // notes earlier (as C# and B natural), so each still needs its own
  // courtesy accidental to cancel that, not silence.
  assertEqual(marks[8], 0, "D melodic minor: descending C natural still needs a natural sign (cancels the C# just shown)");
  assertEqual(marks[9], -1, "D melodic minor: descending Bb still needs a flat (cancels the B natural just shown)");

  // Everything else matches whatever was already in effect for that
  // exact pitch, so nothing further needs drawing.
  [0, 1, 2, 3, 4, 7, 10, 11, 12, 13, 14].forEach(function (i) {
    assertEqual(marks[i], null, "D melodic minor note " + i + " (" + notes[i].letter + notes[i].octave +
      "): matches what's already in effect, no mark needed");
  });
})();

// ---- accidentalsToDisplay: a repeated identical pitch (no barline, and
// nothing intervening to cancel it) only needs its accidental written
// the first time -- this is what makes D harmonic minor's *second*
// octave of C# distinct from its first: the very first C# of the whole
// passage needs the mark, but if the same exact pitch (letter+octave)
// recurs later with nothing in between to have changed it, it's still
// in effect and doesn't need re-marking. ---------------------------------
(function () {
  var d3 = { letter: "D", accidental: 0, octave: 3 };
  var notes = MusicTheory.ascendingAndDescending(MusicTheory.buildScale(d3, "harmonicMinor", 2));
  var sig = MusicTheory.keySignature(d3, "harmonicMinor");
  var marks = MusicTheory.accidentalsToDisplay(notes, sig);

  var cSharp4Indices = [];
  notes.forEach(function (n, i) {
    if (n.letter === "C" && n.octave === 4) cSharp4Indices.push(i);
  });
  assertEqual(cSharp4Indices.length, 2, "D harmonic minor x2 octaves: C#4 occurs twice (once ascending, once descending)");
  assertEqual(marks[cSharp4Indices[0]], 1, "D harmonic minor: C#4's first occurrence needs its sharp written");
  assertEqual(marks[cSharp4Indices[1]], null, "D harmonic minor: C#4's second occurrence is unchanged since the first, no re-mark needed");
})();

// ---- Eb harmonic minor: the natural-minor 7th is already a flat (Db),
// so raising it a semitone lands on D *natural*, not a sharp -- the
// written accidental needed is a natural sign, not always a sharp. -----
(function () {
  var eb3 = { letter: "E", accidental: -1, octave: 3 };
  var scale = MusicTheory.buildScale(eb3, "harmonicMinor");
  assertEqual(names(scale).join(","), "E♭3,F3,G♭3,A♭3,B♭3,C♭4,D4,E♭4",
    "Eb harmonic minor: raised 7th is D natural (cancelling the flat), not D#");
})();

// ---- Db harmonic minor: a rarer case still -- the key signature
// itself already flats B, and the scale's own 6th degree needs it
// flatted a second time (Bbb), a genuine double accidental. ------------
(function () {
  var db3 = { letter: "D", accidental: -1, octave: 3 };
  var scale = MusicTheory.buildScale(db3, "harmonicMinor");
  var sixthDegree = scale[5];
  assertEqual(sixthDegree.letter, "B", "Db harmonic minor: 6th degree is letter B");
  assertEqual(sixthDegree.accidental, -2, "Db harmonic minor: 6th degree is B double-flat (Bbb)");

  var sig = MusicTheory.keySignature(db3, "harmonicMinor");
  assertEqual(MusicTheory.keySignatureAccidentalForLetter(sig, "B"), -1,
    "Db harmonic minor: the key signature only flats B once, so Bbb still needs its own written accidental");
})();

// ---- G major -- a sharp key, to make sure sharp spelling works too. ---
(function () {
  var g3 = { letter: "G", accidental: 0, octave: 3 };
  var scale = MusicTheory.buildScale(g3, "major");

  assertEqual(names(scale).join(","), "G3,A3,B3,C4,D4,E4,F♯4,G4",
    "G major: correct letter spelling (F#, not Gb)");

  var sig = MusicTheory.keySignature(g3, "major");
  assertEqual(sig.flats, 0, "G major key signature: 0 flats");
  assertEqual(sig.sharps, 1, "G major key signature: 1 sharp");

  assertEqual(MusicTheory.keySignatureAccidentalForLetter(sig, "F"), 1,
    "G major: the key signature itself sharps F");
  assertEqual(MusicTheory.keySignatureAccidentalForLetter(sig, "C"), 0,
    "G major: the key signature says nothing about C");
  assertEqual(MusicTheory.keySignatureAccidentalForLetter({ flats: 0, sharps: 0 }, "B"), 0,
    "No key signature: every letter is unaffected");
})();

// ---- Sharp key signature staff positions -- F#4th line, then C# a
// 4th below, then G# a 5th above, alternating -- mirrors the flats'
// zig-zag (which is independently verified above) in the other
// direction, starting from where "F" naturally sits (bass clef line 4). --
(function () {
  function steps(count) { return MusicTheory.keySignatureSharpSteps(count, 6).join(","); }
  assertEqual(steps(0), "", "0 sharps: no positions");
  assertEqual(steps(1), "6", "1 sharp (G major): F# on line 4");
  assertEqual(steps(2), "6,3", "2 sharps (D major): F#, then C# a 4th below");
  assertEqual(steps(3), "6,3,7", "3 sharps (A major): F#, C#, then G# a 5th above C#");
})();

// ---- Bb major arpeggio -- letters skip (root, 3rd, 5th, 8ve) rather
// than stepping through every letter like a scale does. -----------------
(function () {
  var bb2 = { letter: "B", accidental: -1, octave: 2 };
  var arp = MusicTheory.buildScale(bb2, "majorArpeggio");
  assertEqual(names(arp).join(","), "B♭2,D3,F3,B♭3", "Bb major arpeggio: root-3rd-5th-8ve");
})();

// ---- Classical melodic minor is asymmetric: raised 6th/7th ascending
// (like major, approaching the octave), but natural minor's un-raised
// 6th/7th descending -- not just the ascending form played backwards. ---
(function () {
  var d3 = { letter: "D", accidental: 0, octave: 3 };
  var full = MusicTheory.buildMelodicMinorFull(d3);
  assertEqual(names(full).join(","), "D3,E3,F3,G3,A3,B3,C♯4,D4,C4,B♭3,A3,G3,F3,E3,D3",
    "D melodic minor: B/C# ascending (raised), Bb/C descending (natural minor's)");
})();

// ---- Two octaves -- the 1-octave formula repeated and shifted, not a
// separately-hardcoded longer formula. --------------------------------
(function () {
  var bb2 = { letter: "B", accidental: -1, octave: 2 };
  var twoOctaves = MusicTheory.buildScale(bb2, "major", 2);
  assertEqual(twoOctaves.length, 15, "Bb major x2 octaves: 15 notes (7 unique degrees x2 + top)");
  assertEqual(names(twoOctaves).join(","),
    "B♭2,C3,D3,E♭3,F3,G3,A3,B♭3,C4,D4,E♭4,F4,G4,A4,B♭4",
    "Bb major x2 octaves: correct letter spelling continuing into the next octave");

  var arp = MusicTheory.buildScale(bb2, "majorArpeggio", 2);
  assertEqual(names(arp).join(","), "B♭2,D3,F3,B♭3,D4,F4,B♭4",
    "Bb major arpeggio x2 octaves: 7 notes (3 unique degrees x2 + top)");
})();

// ---- Ascending then descending -- the peak isn't repeated. ------------
(function () {
  var bb2 = { letter: "B", accidental: -1, octave: 2 };
  var scale = MusicTheory.buildScale(bb2, "major");
  var upAndDown = MusicTheory.ascendingAndDescending(scale);
  assertEqual(upAndDown.length, 15, "Up-and-down 1 octave: 8 up + 7 down (peak not repeated)");
  assertEqual(names(upAndDown).join(","),
    "B♭2,C3,D3,E♭3,F3,G3,A3,B♭3,A3,G3,F3,E♭3,D3,C3,B♭2",
    "Up-and-down 1 octave: mirrors back down through the same notes");
})();

// ---- Trombone positions: cross-check the harmonic-series model
// reproduces the hand-verified positions for the whole Bb major scale. --
(function () {
  var bb2 = { letter: "B", accidental: -1, octave: 2 };
  var scale = MusicTheory.buildScale(bb2, "major");
  var expectedPositions = [1, 6, 4, 3, 1, 4, 2, 1]; // as played in the trombone widget

  scale.forEach(function (note, i) {
    var options = TrombonePositions.positionOptionsForNote(note);
    var positions = options.map(function (o) { return o.position; });
    assert(positions.indexOf(expectedPositions[i]) !== -1,
      MusicTheory.noteName(note) + " should have position " + expectedPositions[i] +
      " among its valid options (" + positions.join(",") + ")");
  });

  // Bb2 in 1st position is the horn's 2nd partial (the note right above pedal).
  var bb2Options = TrombonePositions.positionOptionsForNote(bb2);
  assert(bb2Options.some(function (o) { return o.position === 1 && o.partial === 2; }),
    "Bb2 should be reachable as position 1, partial 2");
})();

// ---- The flat-7th-partial alternate is present (not omitted), and its
// position number already carries the real physical compensation --
// there's no separate penalty on top of that, so "prefer low position"
// legitimately picks it when it really is the lowest number. ----------
(function () {
  var g4 = { letter: "G", accidental: 0, octave: 4 };
  var options = TrombonePositions.positionOptionsForNote(g4);

  assert(options.some(function (o) { return o.position === 1.75 && o.partial === 7 && o.approximate; }),
    "G4 should have an approximate alternate at position 1.75 (position 2, sharpened a quarter position to compensate for partial 7's flatness)");
  assert(options.some(function (o) { return o.position === 4 && o.partial === 8 && !o.approximate; }),
    "G4 should also have a clean option at position 4 (partial 8)");

  var solved = require("./solver.js").solve([g4], TrombonePositions.positionOptionsForNote,
    { position: 1, positionChange: 0, directionChange: 0 });
  assertEqual(solved.positions[0], 1.75, "G4 alone: prefer-low-position picks 1.75, the genuinely lowest number");
  assertEqual(solved.approximate[0], true, "G4 alone: that choice is flagged approximate (informational only, no cost)");
})();

// ---- Every one of the 12 roots, in all 6 scale/arpeggio types, must
// actually have a playable slide position for every note -- this is
// the check that would have caught the B-major crash (B4 has no valid
// position at all on a trigger-less trombone, clean or approximate;
// the picker works around it by starting B's scale an octave lower). --
(function () {
  var Solver = require("./solver.js");
  var ROOTS_WITH_OCTAVE = [
    ["C", "C", 0, 3], ["Db", "D", -1, 3], ["D", "D", 0, 3], ["Eb", "E", -1, 3],
    ["E", "E", 0, 3], ["F", "F", 0, 3], ["F#", "F", 1, 3], ["G", "G", 0, 3],
    ["Ab", "A", -1, 3], ["A", "A", 0, 3], ["Bb", "B", -1, 3], ["B", "B", 0, 2]
  ];
  var TYPES = ["major", "naturalMinor", "harmonicMinor", "melodicMinor", "majorArpeggio", "minorArpeggio"];

  ROOTS_WITH_OCTAVE.forEach(function (r) {
    var root = { letter: r[1], accidental: r[2], octave: r[3] };
    TYPES.forEach(function (type) {
      var notes = MusicTheory.buildScale(root, type);
      var threw = false;
      try {
        Solver.solve(notes, TrombonePositions.positionOptionsForNote, { position: 1, positionChange: 0.1, directionChange: 0 });
      } catch (e) {
        threw = true;
      }
      assert(!threw, r[0] + " " + type + ": every note should have a playable position");
    });
  });
})();

console.log(passes + " passed, " + failures + " failed");
process.exit(failures > 0 ? 1 : 0);
