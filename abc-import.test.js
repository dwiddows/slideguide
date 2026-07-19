/**
 * node abc-import.test.js
 */
var AbcImport = require("./abc-import.js");
var MusicTheory = require("./music-theory.js");

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
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    message + " (got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected) + ")");
}

function names(notes) { return notes.map(MusicTheory.noteName); }

// ---- Twinkle Twinkle: a plain-C-major melody with no accidentals at
// all, checking pitch, octave, and duration (half notes at the end of
// each phrase) all come out right from abcjs's own parse. ---------------
(function () {
  var abc = "X:1\nL:1/4\nM:4/4\nK:C\n" +
    "C C G G | A A G2 | F F E E | D D C2 |\n" +
    "G G F F | E E D2 | G G F F | E E D2 |\n" +
    "C C G G | A A G2 | F F E E | D D C2 |]\n";
  var result = AbcImport.parseAbcMelody(abc);

  assertEqual(result.keySignature, { flats: 0, sharps: 0 }, "Twinkle Twinkle: C major, no key-signature accidentals");
  assertEqual(names(result.notes).slice(0, 8), ["C4", "C4", "G4", "G4", "A4", "A4", "G4", "F4"],
    "Twinkle Twinkle: first phrase pitches");
  assertEqual(result.durations.slice(0, 8), [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.5, 0.25],
    "Twinkle Twinkle: quarter notes throughout except the half note ending each phrase");
  assertEqual(result.notes.length, 42, "Twinkle Twinkle: 42 notes total (3 lines x 14)");
})();

// ---- Key-signature accidentals apply even when a note is never
// explicitly marked: G major sharpens every F by default. -------------
(function () {
  var abc = "X:1\nL:1/4\nK:G\nF G A B |]\n";
  var result = AbcImport.parseAbcMelody(abc);
  assertEqual(result.keySignature, { flats: 0, sharps: 1 }, "G major: 1 sharp in the key signature");
  assertEqual(names(result.notes), ["F♯4", "G4", "A4", "B4"],
    "G major: plain F still sounds sharp from the key signature alone, with no explicit accidental written");
})();

// ---- An explicit accidental overrides the key signature for the rest
// of that measure (including on plain repeats of the same letter), and
// the next barline resets it back to the key signature's own default. --
(function () {
  var abc = "X:1\nL:1/4\nK:G\nF F ^F F | F G,, c' | =F F\n";
  var result = AbcImport.parseAbcMelody(abc);
  assertEqual(names(result.notes), ["F♯4", "F♯4", "F♯4", "F♯4", "F♯4", "G2", "C6", "F4", "F4"],
    "measure 1: all F's sharp (key signature, reinforced by an explicit sharp mid-measure); " +
    "measure 2: the barline resets to the key signature, so a plain F is still sharp; " +
    "measure 3: an explicit natural overrides that, and holds for the plain F right after it");
})();

// ---- Octave modifiers (comma down, apostrophe up) move by exactly one
// octave each, anchored so plain uppercase letters sit in octave 4 --
// this app's own middle-C convention (see music-theory.js). -----------
(function () {
  var abc = "X:1\nL:1/4\nK:C\nC,, C, C c c' |]\n";
  var result = AbcImport.parseAbcMelody(abc);
  assertEqual(names(result.notes), ["C2", "C3", "C4", "C5", "C6"],
    "C,, C, C c c': one octave apart each, plain uppercase C is C4");
})();

// ---- Rests come back as null (a real, timed gap), not skipped --
// durations for the rest itself and its surrounding notes are all
// preserved, so playback/staff spacing can see the actual silence. -----
(function () {
  var abc = "X:1\nL:1/4\nK:C\nC z C2 |]\n";
  var result = AbcImport.parseAbcMelody(abc);
  assertEqual(result.notes.map(function (n) { return n === null ? null : MusicTheory.noteName(n); }),
    ["C4", null, "C4"], "a rest comes back as null, in place, not omitted");
  assertEqual(result.durations, [0.25, 0.25, 0.5], "the rest keeps its own real duration alongside the notes");
})();

// ---- Multi-measure rests (Z/X) get their duration resolved against
// the tune's own time signature (by abcjs), not left as a bare measure
// count -- and the invisible variants (x/X) behave identically to
// their visible counterparts (z/Z) for our purposes, since this app
// only cares about the timed gap, not whether a rest glyph is drawn. ---
(function () {
  var abc = "X:1\nL:1/8\nM:4/4\nK:C\nC z2 C x2 C |\nC Z2 C X2 C |\n";
  var result = AbcImport.parseAbcMelody(abc);
  assertEqual(result.notes.map(function (n) { return n === null; }),
    [false, true, false, true, false, false, true, false, true, false],
    "z, x, Z, and X all come back as null in the same way");
  assertEqual(result.durations, [0.125, 0.25, 0.125, 0.25, 0.125, 0.125, 2, 0.125, 2, 0.125],
    "a multi-measure rest's duration (Z2/X2 in 4/4 = 2 whole measures = 2.0) is resolved for us");
})();

// ---- A tune that's nothing but rests still fails to parse -- there's
// no melody to play regardless of how much silence surrounds it. ------
(function () {
  var abc = "X:1\nL:1/4\nK:C\nz z z |]\n";
  assert((function () {
    try { AbcImport.parseAbcMelody(abc); return false; } catch (e) { return true; }
  })(), "an all-rest tune throws, rather than silently accepting zero real notes");
})();

// ---- A tune with an explicit line break part-way through a bar still
// carries accidental state across that break -- a line break is only
// layout, not a musical event. ------------------------------------------
(function () {
  var abc = "X:1\nL:1/4\nK:G\nF ^F F\nF F\n";
  var result = AbcImport.parseAbcMelody(abc);
  assertEqual(names(result.notes), ["F♯4", "F♯4", "F♯4", "F♯4", "F♯4"],
    "an explicit sharp still holds across a line break within the same measure");
})();

console.log(passes + " passed, " + failures + " failed");
process.exit(failures > 0 ? 1 : 0);
