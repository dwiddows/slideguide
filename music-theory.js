/**
 * Generic music theory: notes, scales, arpeggios, frequency and staff
 * position, and key signatures. Nothing here is trombone-specific --
 * that lives in trombone-positions.js.
 *
 * Works as a plain global (<script src="music-theory.js">) in the
 * browser and as a CommonJS module under Node, so the same file can
 * be unit-tested directly with `node *.test.js`.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.MusicTheory = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var NATURAL_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // A note is {letter, accidental, octave}. accidental is signed
  // semitones off natural (-1 = flat, 0 = natural, 1 = sharp).
  // octave uses scientific pitch notation (C4 = middle C).

  function letterIndex(letter) {
    return LETTERS.indexOf(letter);
  }

  // A single integer that counts every line/space once, independent of
  // clef: absoluteLetterIndex(C4) = 4*7+0 = 28. This doubles as (a) the
  // input to frequency calculation once combined with the accidental,
  // and (b) the universal diatonic "step" used for staff placement --
  // a clef just picks its own zero point (see toBassClefStep below).
  function absoluteLetterIndex(note) {
    return note.octave * 7 + letterIndex(note.letter);
  }

  function absoluteSemitone(note) {
    return note.octave * 12 + NATURAL_SEMITONE[note.letter] + note.accidental;
  }

  var A4_SEMITONE = 4 * 12 + 9; // A4, no accidental

  function frequency(note) {
    return 440 * Math.pow(2, (absoluteSemitone(note) - A4_SEMITONE) / 12);
  }

  // Bass clef's bottom line is G2. Every other clef is just a
  // different additive constant on the same absoluteLetterIndex scale.
  var BASS_CLEF_BOTTOM_LINE_INDEX = absoluteLetterIndex({ letter: "G", octave: 2 });
  function toBassClefStep(note) {
    return absoluteLetterIndex(note) - BASS_CLEF_BOTTOM_LINE_INDEX;
  }

  function noteName(note) {
    var acc = note.accidental === -1 ? "♭" : note.accidental === 1 ? "♯" : "";
    return note.letter + acc + note.octave;
  }

  // Move a note by a number of semitones (for pitch) and a number of
  // diatonic letters (for correct spelling): the letter is always just
  // "root letter + letterOffset steps around ABCDEFG", and the
  // accidental is whatever is needed on that letter to land on the
  // target pitch. This is what keeps scale spelling correct (F major
  // is F,G,A,Bb,C,D,E,F -- never F,G,A,A#,... ) instead of just
  // stacking semitones blindly.
  function transposeNote(note, semitoneOffset, letterOffset) {
    var fromIndex = absoluteLetterIndex(note);
    var toIndex = fromIndex + letterOffset;
    var letter = LETTERS[((toIndex % 7) + 7) % 7];
    var octave = Math.floor(toIndex / 7);

    var targetSemitone = absoluteSemitone(note) + semitoneOffset;
    var naturalSemitoneAtTarget = octave * 12 + NATURAL_SEMITONE[letter];
    var accidental = targetSemitone - naturalSemitoneAtTarget;
    // Normalize into [-2, 2]: the same pitch class is reachable many
    // octaves of accidental away, but only a small range is sane to notate.
    while (accidental > 2) accidental -= 12;
    while (accidental < -2) accidental += 12;

    return { letter: letter, accidental: accidental, octave: octave };
  }

  // Each entry is [semitoneOffset, letterOffset] relative to the root.
  // Scales use one letter per degree (letterOffset = degree index);
  // arpeggios skip letters (root, 3rd, 5th, octave), which is why this
  // can't just be derived from the semitone list alone.
  var SCALE_TYPES = {
    major: [[0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [11, 6], [12, 7]],
    naturalMinor: [[0, 0], [2, 1], [3, 2], [5, 3], [7, 4], [8, 5], [10, 6], [12, 7]],
    harmonicMinor: [[0, 0], [2, 1], [3, 2], [5, 3], [7, 4], [8, 5], [11, 6], [12, 7]],
    melodicMinor: [[0, 0], [2, 1], [3, 2], [5, 3], [7, 4], [9, 5], [11, 6], [12, 7]], // ascending form
    majorArpeggio: [[0, 0], [4, 2], [7, 4], [12, 7]],
    minorArpeggio: [[0, 0], [3, 2], [7, 4], [12, 7]]
  };

  // Repeats a one-octave formula for more octaves: everything but the
  // final (octave-completing) degree gets copied once per extra
  // octave, each copy shifted up by 12 semitones and 7 letters, with
  // the true top note appended once at the end. E.g. a 7-degree scale
  // formula (8 entries incl. the octave) becomes 15 entries for 2
  // octaves; a 3-degree arpeggio (4 entries) becomes 7.
  function extendFormulaToOctaves(formula, octaves) {
    if (octaves <= 1) return formula;
    var perOctave = formula.slice(0, formula.length - 1);
    var extended = [];
    for (var oct = 0; oct < octaves; oct++) {
      perOctave.forEach(function (pair) {
        extended.push([pair[0] + oct * 12, pair[1] + oct * 7]);
      });
    }
    var top = formula[formula.length - 1];
    extended.push([top[0] + (octaves - 1) * 12, top[1] + (octaves - 1) * 7]);
    return extended;
  }

  function buildScale(root, typeKey, octaves) {
    var formula = SCALE_TYPES[typeKey];
    if (!formula) throw new Error("Unknown scale/arpeggio type: " + typeKey);
    var extended = extendFormulaToOctaves(formula, octaves || 1);
    return extended.map(function (pair) {
      return transposeNote(root, pair[0], pair[1]);
    });
  }

  // Ascending notes played back down again, without repeating the peak.
  function ascendingAndDescending(notes) {
    return notes.concat(notes.slice(0, -1).reverse());
  }

  // Classical melodic minor is asymmetric: it raises the 6th and 7th
  // ascending (so it approaches the octave like a major scale), but
  // descends using natural minor's un-raised 6th and 7th instead of
  // just mirroring its own ascending form. The two formulas share the
  // same top note (the octave itself), so the descent is natural
  // minor's notes reversed with that shared peak dropped.
  function buildMelodicMinorFull(root, octaves) {
    var ascending = buildScale(root, "melodicMinor", octaves || 1);
    var descendingSource = buildScale(root, "naturalMinor", octaves || 1);
    return ascending.concat(descendingSource.slice(0, -1).reverse());
  }

  // The relative major shares a key signature with its minor (the
  // signature itself never carries harmonic/melodic-minor accidentals --
  // those are written as one-off accidentals in the music). A minor
  // third up, two letters up, gets you from any minor tonic to its
  // relative major.
  function relativeMajorOf(root) {
    return transposeNote(root, 3, 2);
  }

  var MINOR_TYPES = { naturalMinor: true, harmonicMinor: true, melodicMinor: true };

  // Returns { flats, sharps } -- the count of each in the key signature.
  // For a genuine key one of these is always 0; we don't assume that,
  // we just count accidentals in the relevant major scale's spelling.
  function keySignature(root, typeKey) {
    var majorRoot = MINOR_TYPES[typeKey] ? relativeMajorOf(root) : root;
    var majorNotes = buildScale(majorRoot, "major").slice(0, 7); // one octave, no repeated tonic
    var flats = 0, sharps = 0;
    majorNotes.forEach(function (n) {
      if (n.accidental < 0) flats++;
      if (n.accidental > 0) sharps++;
    });
    return { flats: flats, sharps: sharps };
  }

  var FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
  var SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];

  // What accidental (-1, 0, or 1) the key signature already applies to
  // a given letter, regardless of octave. Used to decide whether a note
  // needs its own accidental mark drawn: a harmonic minor's raised 7th,
  // for instance, isn't in its key signature at all (that only ever
  // carries the relative major's flats/sharps -- see keySignature
  // above), so it needs an explicit sharp every time it's written.
  function keySignatureAccidentalForLetter(sig, letter) {
    if (FLAT_ORDER.slice(0, sig.flats).indexOf(letter) !== -1) return -1;
    if (SHARP_ORDER.slice(0, sig.sharps).indexOf(letter) !== -1) return 1;
    return 0;
  }

  // Which notes in a sequence need an explicit accidental mark drawn,
  // in real notation order. A given pitch (its letter and octave)
  // starts out at whatever the key signature implies, and then holds
  // whatever was last written for it -- there's no barline here to
  // reset that, so once a note's been shown raised or lowered, it stays
  // in effect (and needs re-cancelling with its own mark) until
  // something actually writes a different accidental for that same
  // pitch, however much later that is. Returns one entry per input
  // note: the accidental to show, or null if nothing needs drawing.
  function accidentalsToDisplay(notes, keySig) {
    var displayed = {};
    return notes.map(function (n) {
      var key = n.letter + n.octave;
      if (!(key in displayed)) {
        displayed[key] = keySignatureAccidentalForLetter(keySig, n.letter);
      }
      var needsMark = n.accidental !== displayed[key];
      displayed[key] = n.accidental;
      return needsMark ? n.accidental : null;
    });
  }

  // The order flats appear in a key signature is always B,E,A,D,G,C,F,
  // each a 4th above the previous alternating with a 5th below,
  // starting from wherever "B" naturally sits in the given clef --
  // this produces the standard zig-zag without hardcoding any one key.
  function keySignatureFlatSteps(count, bStep) {
    var steps = [];
    var step = bStep;
    for (var i = 0; i < count; i++) {
      if (i > 0) step += (i % 2 === 1) ? 3 : -4;
      steps.push(step);
    }
    return steps;
  }

  // The order sharps appear in a key signature is always F,C,G,D,A,E,B --
  // the mirror image of the flat order, each a 4th below the previous
  // alternating with a 5th above, starting from wherever "F" naturally
  // sits in the given clef. Same reasoning as the flats, opposite
  // direction (flats descend by 5ths from B; sharps ascend by 5ths from F).
  function keySignatureSharpSteps(count, fStep) {
    var steps = [];
    var step = fStep;
    for (var i = 0; i < count; i++) {
      if (i > 0) step += (i % 2 === 1) ? -3 : 4;
      steps.push(step);
    }
    return steps;
  }

  return {
    LETTERS: LETTERS,
    SCALE_TYPES: SCALE_TYPES,
    transposeNote: transposeNote,
    buildScale: buildScale,
    ascendingAndDescending: ascendingAndDescending,
    buildMelodicMinorFull: buildMelodicMinorFull,
    relativeMajorOf: relativeMajorOf,
    keySignature: keySignature,
    keySignatureAccidentalForLetter: keySignatureAccidentalForLetter,
    accidentalsToDisplay: accidentalsToDisplay,
    keySignatureFlatSteps: keySignatureFlatSteps,
    keySignatureSharpSteps: keySignatureSharpSteps,
    frequency: frequency,
    absoluteSemitone: absoluteSemitone,
    absoluteLetterIndex: absoluteLetterIndex,
    toBassClefStep: toBassClefStep,
    noteName: noteName
  };
});
