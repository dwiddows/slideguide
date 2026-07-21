/**
 * Which slide positions can produce a given pitch on a Bb tenor
 * trombone (no trigger). This is real acoustics, not a lookup table:
 * position P's fundamental is a semitone lower than position P-1's,
 * and each position offers that fundamental's harmonic series. So
 * "what positions play this note" is computed from the harmonic
 * series, the same way the Bb major scale's positions were derived
 * by hand earlier -- this function reproduces that derivation exactly
 * (see trombone-positions.test.js).
 *
 * Depends on music-theory.js (for absoluteSemitone / note construction).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./music-theory.js"));
  } else {
    root.TrombonePositions = factory(root.MusicTheory);
  }
})(typeof self !== "undefined" ? self : this, function (MusicTheory) {
  "use strict";

  var MAX_POSITION = 7;

  // Position 1's fundamental is the horn's pedal Bb; each subsequent
  // position lowers the fundamental by one semitone.
  var POSITION_1_FUNDAMENTAL_SEMITONE = MusicTheory.absoluteSemitone({
    letter: "B", accidental: -1, octave: 1
  });

  function fundamentalSemitone(position) {
    return POSITION_1_FUNDAMENTAL_SEMITONE - (position - 1);
  }

  // Semitones above the fundamental for partials 2..9, rounded to the
  // nearest 12-TET semitone. Partial 1 (the pedal tone itself) is left
  // out -- it isn't used in this register. Two partials are flagged
  // `approximate`, for different reasons, so callers (the solver) can
  // use them without treating them as equally-easy first choices:
  //   - partial 7 (~33.7 semitones, ~31 cents flat of the 34 we round
  //     to) is a well-known out-of-tune alternate.
  //   - partial 9 (~38.0 semitones, only ~4 cents sharp -- genuinely
  //     in tune) is instead flagged for being a hard-to-produce extreme
  //     high partial, needed to reach the top of some 2-octave runs.
  var PARTIAL_INTERVAL = { 2: 12, 3: 19, 4: 24, 5: 28, 6: 31, 7: 34, 8: 36, 9: 38 };
  var APPROXIMATE_PARTIALS = { 7: true, 9: true };

  // Partial 7 is genuinely flat (~31 cents), and players compensate by
  // shortening the slide slightly to sharpen it back up -- roughly a
  // quarter position's worth of correction, close to the real error
  // (0.31 semitones vs. a position being ~1 semitone). Partial 9 needs
  // no such correction; its ~4 cents is negligible.
  var POSITION_CORRECTION = { 7: -0.25 };

  // Every (position, partial) combination that produces targetSemitone.
  function positionOptionsForSemitone(targetSemitone) {
    var options = [];
    for (var position = 1; position <= MAX_POSITION; position++) {
      var fundamental = fundamentalSemitone(position);
      for (var partial in PARTIAL_INTERVAL) {
        if (fundamental + PARTIAL_INTERVAL[partial] === targetSemitone) {
          var correction = POSITION_CORRECTION[partial] || 0;
          var correctedPosition = position + correction;
          // Position 1 is the slide fully closed -- the shortest it can
          // physically be. A correction that would need to shorten it
          // further (partial 7 at position 1) can't actually happen:
          // there's nowhere left to move, so this stays genuinely flat
          // with no fix available, unlike the same partial at any other
          // position. Not a usable option, so it's dropped rather than
          // clamped to look like an ordinary (correctable) position 1.
          if (correctedPosition < 1) continue;
          options.push({
            position: correctedPosition,
            partial: Number(partial),
            approximate: !!APPROXIMATE_PARTIALS[partial]
          });
        }
      }
    }
    return options;
  }

  function positionOptionsForNote(note) {
    return positionOptionsForSemitone(MusicTheory.absoluteSemitone(note));
  }

  // Each position's own fundamental, spelled the conventional way (the
  // same names as the How It Works table in index.html) -- chromatic
  // descent by a single semitone doesn't have one universally-correct
  // letter to move to, so these are the standard names, not derived.
  var POSITION_FUNDAMENTALS = [
    { letter: "B", accidental: -1, octave: 1 }, // 1: B♭
    { letter: "A", accidental: 0, octave: 1 },  // 2: A
    { letter: "A", accidental: -1, octave: 1 }, // 3: A♭
    { letter: "G", accidental: 0, octave: 1 },  // 4: G
    { letter: "G", accidental: -1, octave: 1 }, // 5: G♭
    { letter: "F", accidental: 0, octave: 1 },  // 6: F
    { letter: "E", accidental: 0, octave: 1 }   // 7: E
  ];

  // The natural harmonic series itself -- partials 1..maxPartial over a
  // given position's own fundamental (position 1's pedal B♭ by
  // default). Diatonic letter offsets per partial (fixed, not derived --
  // this is just how the series is conventionally spelled: the 7th
  // partial is written A♭, never G♯) are passed to transposeNote
  // alongside the semitone interval, the same two-part mechanism this
  // app uses everywhere else to keep note spelling correct -- and it
  // works unchanged for any of the 7 fundamentals above, since the
  // pattern of intervals above a fundamental is the same regardless of
  // which pitch that fundamental itself is.
  var PARTIAL_LETTER_OFFSET = { 1: 0, 2: 7, 3: 11, 4: 14, 5: 16, 6: 18, 7: 20, 8: 21, 9: 23 };

  function naturalHarmonicSeries(maxPartial, position) {
    var fundamental = POSITION_FUNDAMENTALS[(position || 1) - 1];
    var series = [];
    for (var partial = 1; partial <= maxPartial; partial++) {
      var semitoneOffset = partial === 1 ? 0 : PARTIAL_INTERVAL[partial];
      var note = MusicTheory.transposeNote(fundamental, semitoneOffset, PARTIAL_LETTER_OFFSET[partial]);
      series.push({ partial: partial, note: note, approximate: !!APPROXIMATE_PARTIALS[partial] });
    }
    return series;
  }

  // How much longer the tube is at this position than at position 1 --
  // each position down is one semitone lower, and length is inversely
  // proportional to frequency, so it grows by the 12-TET semitone ratio
  // per position (position 7, the full slide extension, is about 41%
  // longer than position 1 -- a tritone's worth of semitones).
  function relativeTubeLength(position) {
    return Math.pow(2, (position - 1) / 12);
  }

  return {
    MAX_POSITION: MAX_POSITION,
    fundamentalSemitone: fundamentalSemitone,
    positionOptionsForSemitone: positionOptionsForSemitone,
    positionOptionsForNote: positionOptionsForNote,
    naturalHarmonicSeries: naturalHarmonicSeries,
    relativeTubeLength: relativeTubeLength
  };
});
