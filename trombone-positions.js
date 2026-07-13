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
          options.push({
            position: Math.max(1, position + correction),
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

  return {
    MAX_POSITION: MAX_POSITION,
    fundamentalSemitone: fundamentalSemitone,
    positionOptionsForSemitone: positionOptionsForSemitone,
    positionOptionsForNote: positionOptionsForNote
  };
});
