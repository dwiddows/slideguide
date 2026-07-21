/**
 * node trombone-positions.test.js
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
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    message + " (got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected) + ")");
}

// ---- naturalHarmonicSeries: the horn's own pedal-B♭ series, partials
// 1..8, spelled the conventional way (a flat 7th partial, not G♯). -------
(function () {
  var series = TrombonePositions.naturalHarmonicSeries(8);
  assertEqual(series.map(function (h) { return h.partial; }), [1, 2, 3, 4, 5, 6, 7, 8],
    "one entry per partial, in order");
  assertEqual(series.map(function (h) { return MusicTheory.noteName(h.note); }),
    ["B♭1", "B♭2", "F3", "B♭3", "D4", "F4", "A♭4", "B♭4"],
    "pedal B♭ up through its own natural harmonic series, correctly spelled");
  assertEqual(series.map(function (h) { return h.approximate; }),
    [false, false, false, false, false, false, true, false],
    "only the 7th partial is flagged approximate (it's genuinely flat)");
})();

// ---- Every partial's frequency really is that whole-number multiple
// of the fundamental's -- the acoustic definition of a harmonic series,
// not just plausible-looking note names. ---------------------------------
(function () {
  var series = TrombonePositions.naturalHarmonicSeries(8);
  var fundamentalFreq = MusicTheory.frequency(series[0].note);
  series.forEach(function (h) {
    var ratio = MusicTheory.frequency(h.note) / fundamentalFreq;
    // 12-TET's own rounding of a just harmonic series is already a few
    // percent off in places (its major third, partial 5, is ~14 cents/
    // 0.8% sharp of true -- a known, expected property of equal
    // temperament, not a bug here), so the tolerance has to cover that
    // before even considering the flat 7th's extra, deliberate error.
    var tolerance = h.approximate ? 0.02 : 0.01;
    assert(Math.abs(ratio - h.partial) < h.partial * tolerance,
      "partial " + h.partial + "'s frequency should be about " + h.partial + "x the fundamental (got " +
      ratio.toFixed(3) + "x)");
  });
})();

console.log(passes + " passed, " + failures + " failed");
process.exit(failures > 0 ? 1 : 0);
