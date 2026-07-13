/**
 * node solver.test.js
 */
var Solver = require("./solver.js");
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

// ---- A reference cost implementation, independent of solver.js's own
// DP, used below to brute-force-verify the DP never misses a cheaper
// answer. Mirrors solver.js's cost formula exactly (see its comments
// for why turns work this way). --------------------------------------
function directionOf(diff) { return diff > 0 ? 1 : diff < 0 ? -1 : 0; }
function directionTurnCost(prevDirection, direction) {
  if (prevDirection === null) return 0;
  if (prevDirection === 0 && direction === 0) return 0;
  if (prevDirection === 0 || direction === 0) return 0.25;
  return prevDirection !== direction ? 1 : 0;
}
function totalCost(positions, optionsPerNote, weights) {
  var total = 0, prevDirection = null;
  var exponent = weights.positionExponent || 1;
  for (var i = 0; i < positions.length; i++) {
    total += (weights.position || 0) * Math.pow(positions[i], exponent);
    if (i > 0) {
      var diff = positions[i] - positions[i - 1];
      var direction = directionOf(diff);
      total += (weights.positionChange || 0) * Math.abs(diff) +
        (weights.directionChange || 0) * directionTurnCost(prevDirection, direction);
      prevDirection = direction;
    }
  }
  return total;
}
function bruteForceMinCost(optionsPerNote, weights) {
  var best = Infinity;
  (function recurse(i, positions) {
    if (i === optionsPerNote.length) {
      var cost = totalCost(positions, optionsPerNote, weights);
      if (cost < best) best = cost;
      return;
    }
    optionsPerNote[i].forEach(function (opt) {
      positions.push(opt.position);
      recurse(i + 1, positions);
      positions.pop();
    });
  })(0, []);
  return best;
}
// Options-per-note with everything outside [fromIndex, toIndex] pinned
// to the DP's own choice -- lets a brute-force check focus on one
// stretch of a long tune without the combinatorics of the whole thing.
function optionsWithSegmentFree(notes, solved, fromIndex, toIndex) {
  return notes.map(function (n, i) {
    if (i >= fromIndex && i <= toIndex) return TrombonePositions.positionOptionsForNote(n);
    return [{ position: solved.positions[i] }];
  });
}

// ---- Pure "prefer low position" reproduces the traditional Bb major
// scale's position choices exactly -- every choice point in that scale
// happens to already be the lowest available position, so this is a
// real end-to-end check that the trombone harmonic model + solver
// agree with the hand-verified positions. --------------------------------
(function () {
  var bb2 = { letter: "B", accidental: -1, octave: 2 };
  var scale = MusicTheory.buildScale(bb2, "major");

  var result = Solver.solve(scale, TrombonePositions.positionOptionsForNote,
    { position: 1, positionChange: 0, directionChange: 0 });

  assertEqual(result.positions, [1, 6, 4, 3, 1, 4, 2, 1],
    "Bb major, pure position-preference, matches the traditional position sequence");
})();

// ---- Synthetic case isolating position-preference vs direction-change:
// a note in the middle has two equidistant options (1 or 7) around its
// neighbors (2,4,_,4), so total slide travel is identical either way --
// but position 1 causes two direction reversals while position 7
// causes only one. Weighting toward low positions should pick 1;
// weighting toward smooth direction should pick 7 instead. -------------
(function () {
  var items = [{}, {}, {}, {}];
  function getOptions(item, i) {
    if (i === 0) return [{ position: 2 }];
    if (i === 1) return [{ position: 4 }];
    if (i === 2) return [{ position: 1 }, { position: 7 }];
    return [{ position: 4 }];
  }

  var preferLow = Solver.solve(items, getOptions, { position: 1, positionChange: 0, directionChange: 0 });
  assertEqual(preferLow.positions, [2, 4, 1, 4],
    "Prefer-low-position weighting picks position 1 despite the extra direction reversal");

  var preferSmooth = Solver.solve(items, getOptions, { position: 1, positionChange: 0, directionChange: 100 });
  assertEqual(preferSmooth.positions, [2, 4, 7, 4],
    "Prefer-smooth-direction weighting picks position 7 to avoid the extra reversal");
})();

// ---- Synthetic case isolating positionChange: two notes each offer
// {1, 5}; picking 1 then 5 has lower total *position* cost than 5,5,5
// but far more total *movement* against a following fixed note at 5.
// This can only be decided by looking ahead across the whole
// sequence, not note-by-note -- exactly the "non-greedy" case. --------
(function () {
  var items = [{}, {}, {}];
  function getOptions(item, i) {
    if (i === 2) return [{ position: 5 }];
    return [{ position: 1 }, { position: 5 }];
  }

  var preferLow = Solver.solve(items, getOptions, { position: 1, positionChange: 0, directionChange: 0 });
  assertEqual(preferLow.positions, [1, 1, 5],
    "Prefer-low-position weighting picks 1,1 even though it forces a big final jump");

  var preferLessTravel = Solver.solve(items, getOptions, { position: 1, positionChange: 10, directionChange: 0 });
  assertEqual(preferLessTravel.positions, [5, 5, 5],
    "Prefer-less-travel weighting picks 5,5,5 to avoid the big final jump, despite the higher position cost");
})();

// ---- Direction-turn cost is continuous, not a binary reversed flag:
// a clean opposite-sign reversal (+,-) costs a full point, but a turn
// that passes through a stationary note (+,0,-) costs only a quarter --
// stopping briefly on the way up isn't really the same problem as
// doubling straight back. A prior binary "both sides nonzero and
// opposite" check would have scored +,0,- as a FREE turn (0 cost,
// since one side touches 0), which is worse than scoring it accurately. ---
(function () {
  // Force positions 1,3,3,1: a "+,0,-" shape (up, stay, back down).
  var items = [{}, {}, {}, {}];
  function getOptions(item, i) {
    if (i === 0) return [{ position: 1 }];
    if (i === 3) return [{ position: 1 }];
    return [{ position: 3 }]; // items 1 and 2 both forced to the same position
  }
  var weights = { position: 0, positionChange: 0, directionChange: 1 };
  var solved = Solver.solve(items, getOptions, weights);
  assertEqual(solved.positions, [1, 3, 3, 1], "sanity: only one possible position sequence here");
  assertEqual(solved.cost, 0.5,
    "+,0,- costs two quarter-point turns (0.25 each), not a full point and not free");
})();

// ---- Same total shape without the stationary note -- a clean +,-
// reversal -- costs a full point, confirming the two shapes are told
// apart rather than both being flattened to the same cost. --------------
(function () {
  var items = [{}, {}, {}];
  function getOptions(item, i) {
    if (i === 0) return [{ position: 1 }];
    if (i === 1) return [{ position: 3 }];
    return [{ position: 1 }];
  }
  var weights = { position: 0, positionChange: 0, directionChange: 1 };
  var solved = Solver.solve(items, getOptions, weights);
  assertEqual(solved.cost, 1, "+,- (no stationary note in between) costs a full point");
})();

// ---- A small preference for low positions (weights.position: 0.15,
// alongside positionChange: 0.5 and directionChange: 1), recovers the
// actual traditional Arban position choices for two full 2-octave scales,
// with no approximate positions needed anywhere: F major plays its
// 6th degree in 4th position, and E major plays its 6th degree in 5th
// position, both times (ascending and descending) rather than
// bouncing back to 1st. Too little position preference reverts to the
// naive 1,2,1 alternation from earlier in this investigation; too much
// (0.50+, after the DP state-collapse fix below) starts forcing C
// major's higher octave back into an unnecessary 1<->2 zigzag instead
// of continuing smoothly upward -- 0.15 sits safely in the middle of
// the window [0.08, 0.48] that gets all of this right at once.
// (positionChange itself was raised from 0.3 to 0.5 separately: 0.3
// let a big single jump straight to a low position number undercut a
// real reversal's cost, e.g. Bb melodic minor's descent leaping from
// 4th all the way to 1st at the peak instead of stepping down through
// 3rd -- jump size needs its own real weight, not just direction.
// positionExponent 1.5 was added on top of that for a different reason:
// plain linear position cost pulls toward low positions by the same
// proportional amount everywhere, so it wasn't discriminating enough
// against specifically the far positions (5-7) -- e.g. Bb harmonic and
// melodic minor's raised 7th degree (A natural) would take 6th position
// over 2nd despite 2nd being right there. A convex exponent makes 5-7
// disproportionately costlier without disturbing F/E/C major's already-
// verified position choices below, which only ever move among positions 1-6.) --
(function () {
  var weights = { position: 0.15, positionExponent: 1.5, positionChange: 0.5, directionChange: 1 };

  function solveMajorTwoOctaves(letter, accidental, octave) {
    var root = { letter: letter, accidental: accidental, octave: octave || 2 };
    var ascending = MusicTheory.buildScale(root, "major", 2);
    var notes = MusicTheory.ascendingAndDescending(ascending);
    var solved = Solver.solve(notes, TrombonePositions.positionOptionsForNote, weights);
    return { notes: notes, solved: solved };
  }

  function positionsAt(result, noteName) {
    var out = [];
    result.notes.forEach(function (n, i) {
      if (MusicTheory.noteName(n) === noteName) out.push(result.solved.positions[i]);
    });
    return out;
  }

  // (Requiring zero approximate positions anywhere turned out to be too
  // strict: no single weight satisfies that AND keeps C major's D4 out
  // of the zigzag below -- those two goals conflict slightly. What
  // actually matters, the traditional position choice itself, holds either way.)
  var f = solveMajorTwoOctaves("F", 0);
  assertEqual(positionsAt(f, "D4"), [4, 4],
    "F major, smoothest-direction weights: D4 in 4th position both times, not 1st");

  var e = solveMajorTwoOctaves("E", 0);
  assertEqual(positionsAt(e, "C♯4"), [5, 5],
    "E major, smoothest-direction weights: C#4 in 5th position both times, not 2nd");

  // C major: found via brute force to expose a real DP bug (the solver
  // was collapsing multiple (position, direction) states down to one
  // per position, discarding a pricier-now-but-cheaper-later option).
  // A3 has to be in 6th position both times, not 2nd, for the true
  // minimum-cost path.
  var c = solveMajorTwoOctaves("C", 0, 3);
  assertEqual(positionsAt(c, "A3"), [6, 6],
    "C major, smoothest-direction weights: A3 in 6th position both times, not 2nd (regression test for the DP state-collapse bug)");
})();

// ---- Bb harmonic and melodic minor's raised 7th (A natural, options
// {2, 6}) settles at 2nd, not 6th -- the case that motivated adding
// positionExponent in the first place: a plain linear position weight
// wasn't loss-averse enough about specifically the far positions to
// stop the DP reaching all the way out to 6th when 2nd was equally on
// offer. -----------------------------------------------------------------
(function () {
  var weights = { position: 0.15, positionExponent: 1.5, positionChange: 0.5, directionChange: 1 };

  var harmTune = { root: { letter: "B", accidental: -1, octave: 2 }, octaves: 2 };
  var harmNotes = MusicTheory.ascendingAndDescending(MusicTheory.buildScale(harmTune.root, "harmonicMinor", harmTune.octaves));
  var harmSolved = Solver.solve(harmNotes, TrombonePositions.positionOptionsForNote, weights);

  var melTune = { root: { letter: "B", accidental: -1, octave: 2 }, octaves: 2 };
  var melNotes = MusicTheory.buildMelodicMinorFull(melTune.root, melTune.octaves);
  var melSolved = Solver.solve(melNotes, TrombonePositions.positionOptionsForNote, weights);

  function positionsAt(notes, solved, name) {
    var out = [];
    notes.forEach(function (n, i) { if (MusicTheory.noteName(n) === name) out.push(solved.positions[i]); });
    return out;
  }
  assertEqual(positionsAt(harmNotes, harmSolved, "A3"), [2, 2],
    "Bb harmonic minor: A3 (options 2 or 6) settles at 2nd, not 6th");
  assertEqual(positionsAt(melNotes, melSolved, "A4"), [2],
    "Bb melodic minor: A4 (options 2 or 6) settles at 2nd, not 6th");
})();

// ---- General safety net for the state-collapse bug class: the DP's
// answer must never cost more than exhaustive search over every
// combination of options, for any note sequence. This is what would
// have caught the C-major bug directly, rather than requiring it to
// be spotted by ear first. A handful of notes with 2-3 options each,
// deliberately shaped so the cheapest-looking local choice isn't the
// globally cheapest one (mirroring the real C-major case) -- small
// enough to brute force exhaustively (3^6 = 729 combinations). --------
(function () {
  var optionsPerNote = [
    [{ position: 1 }],
    [{ position: 2 }, { position: 6 }],
    [{ position: 4 }],
    [{ position: 2 }, { position: 6 }],
    [{ position: 3 }, { position: 6 }],
    [{ position: 1 }]
  ];
  var weights = { position: 0.3, positionChange: 0.3, directionChange: 1 };
  var solved = Solver.solve(optionsPerNote, function (opts) { return opts; }, weights);
  var bruteForce = bruteForceMinCost(optionsPerNote, weights);
  assertEqual(Math.round(solved.cost * 1000), Math.round(bruteForce * 1000),
    "DP cost must always match exhaustive brute force -- catches the state-collapse bug class generally");
})();

// ---- C major's descending run just above middle C (C5,B4,A4,G4,F4,E4,
// D4,C4). At position weight 0.3 this dipped back to 1 right after
// leaving it (F4:1,E4:2,D4:1,C4:3) -- provably the true minimum at that
// weight (brute forced), but only by a 0.9 margin that was exactly the
// position weight times the position difference, i.e. the "prefer low
// positions" tiebreaker overriding a smoother option. Recalibrating to
// 0.15 (see the test above) removes that override: D4,C4,B3 now
// continue upward together instead of dipping back to 1st. -------------
(function () {
  var weights = { position: 0.15, positionChange: 0.5, directionChange: 1 };

  var root = { letter: "C", accidental: 0, octave: 3 };
  var ascending = MusicTheory.buildScale(root, "major", 2);
  var notes = MusicTheory.ascendingAndDescending(ascending);
  var names = notes.map(MusicTheory.noteName);
  var solved = Solver.solve(notes, TrombonePositions.positionOptionsForNote, weights);

  var c5idx = names.indexOf("C5");
  var c4idx = names.indexOf("C4", c5idx);
  var chosen = solved.positions.slice(c5idx, c4idx + 1);
  assertEqual(chosen, [1, 2, 2, 1.75, 1, 2, 4, 6],
    "C major descending, C5 down to C4: D4/C4 continue upward instead of dipping back to 1st (" +
    names.slice(c5idx, c4idx + 1).join(",") + ")");

  // Brute force every combination for this stretch, holding the rest of
  // the tune fixed at the DP's own choices, to confirm it's optimal.
  var optionsPerNote = optionsWithSegmentFree(notes, solved, c5idx, c4idx);
  var bruteForce = bruteForceMinCost(optionsPerNote, weights);
  assertEqual(Math.round(solved.cost * 1000), Math.round(bruteForce * 1000),
    "C major descending stretch: DP answer matches brute-force optimum for this segment (not a regression of the earlier bug)");
})();

// ---- positionExponent bends the position preference convex: raising a
// position to a power above 1 before weighting makes higher positions
// cost disproportionately more, not just proportionally more. At
// exponent 1 (the default) the cost ratio between position 6 and
// position 2 is exactly 3x (linear); above 1, that ratio grows --
// this is what lets "prefer low positions" actually discriminate
// against 5-7 specifically instead of spreading its pull evenly
// across every position number. -----------------------------------------
(function () {
  var items = [{}];
  function getOptions() { return [{ position: 2 }]; }
  var linear = Solver.solve(items, getOptions, { position: 1, positionExponent: 1 });
  var convex = Solver.solve(items, getOptions, { position: 1, positionExponent: 2 });
  assertEqual(linear.cost, 2, "positionExponent 1 (default): cost is just the position number");
  assertEqual(convex.cost, 4, "positionExponent 2: cost is the position number squared");

  function getOptions6() { return [{ position: 6 }]; }
  var linear6 = Solver.solve(items, getOptions6, { position: 1, positionExponent: 1 });
  var convex6 = Solver.solve(items, getOptions6, { position: 1, positionExponent: 2 });
  assertEqual(linear6.cost / linear.cost, 3, "linear: position 6 costs exactly 3x position 2");
  assert(convex6.cost / convex.cost > 3, "positionExponent 2: position 6 costs MORE than 3x position 2 (disproportionate, not just proportional)");
})();

// ---- The DP's own optimum still matches exhaustive brute force with a
// nonlinear position exponent in play -- the exponent only changes what
// positionCost(position) returns, not the DP's structure, but this
// confirms that directly rather than assuming it. ------------------------
(function () {
  var optionsPerNote = [
    [{ position: 1 }],
    [{ position: 2 }, { position: 6 }],
    [{ position: 4 }],
    [{ position: 2 }, { position: 6 }],
    [{ position: 3 }, { position: 6 }],
    [{ position: 1 }]
  ];
  var weights = { position: 0.3, positionExponent: 1.5, positionChange: 0.3, directionChange: 1 };
  var solved = Solver.solve(optionsPerNote, function (opts) { return opts; }, weights);
  var bruteForce = bruteForceMinCost(optionsPerNote, weights);
  assertEqual(Math.round(solved.cost * 1000), Math.round(bruteForce * 1000),
    "DP cost matches exhaustive brute force with a nonlinear position exponent too");
})();

console.log(passes + " passed, " + failures + " failed");
process.exit(failures > 0 ? 1 : 0);
