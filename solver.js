/**
 * Chooses one position per note out of several valid options, trading
 * off (via weights) four things:
 *   - position:        prefer a low position number ("closer to the bell")
 *   - positionChange:  prefer less total slide travel between notes
 *   - directionChange: prefer fewer reversals of slide direction (a
 *                       clean opposite-sign reversal costs a full
 *                       point; a turn via a stationary note -- +,0,-
 *                       or -,0,+ -- costs a quarter point, since
 *                       stopping briefly on the way up or down isn't
 *                       really the same problem as doubling back)
 *   - endzone:         prefer not passing up closer alternatives, scaled
 *                       by how many there were -- a note with only one
 *                       reachable position (e.g. low C, only playable in
 *                       6th) pays nothing for being "far out", since
 *                       there was nothing closer to pass up; a note with
 *                       three options pays 2x if it takes the farthest
 *                       one. This is deliberately not just "penalize high
 *                       position numbers": that would wrongly punish
 *                       notes that have no closer choice at all.
 *
 * The latter two can't be decided note-by-note -- a locally cheap
 * choice can force an expensive one later -- so this is a dynamic
 * program over (position, incoming direction) rather than a greedy
 * per-note pick. State space is tiny (a handful of positions x three
 * directions), so this is cheap even for a long tune.
 *
 * Options may also be marked `approximate` (e.g. the trombone's
 * flat-7th-partial alternates). That flag carries no cost of its own --
 * the position number these options report already has any real
 * physical compensation baked in (e.g. partial 7's position is
 * pre-adjusted for its actual tuning error), so there's nothing left
 * to additionally penalize; a second, separate "avoid approximate"
 * cost would just be a made-up rule stacked on top of a real one. The
 * flag is passed through purely as information, e.g. for display.
 *
 * Not trombone-specific: pass in whatever getOptions(item) returns
 * objects with a numeric `position` field, for any instrument.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Solver = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function directionOf(diff) {
    return diff > 0 ? 1 : diff < 0 ? -1 : 0;
  }

  // Cost of the turn between two consecutive transitions' directions.
  // Opposite nonzero signs (+ then -, or - then +) is a real reversal:
  // 1 point. Either side touching 0 (a stationary note in between) is
  // ambiguous rather than a clear doubling-back: a quarter point. Same
  // sign, or nothing to compare yet, costs nothing.
  function directionTurnCost(prevDirection, direction) {
    if (prevDirection === null) return 0;
    if (prevDirection === 0 && direction === 0) return 0;
    if (prevDirection === 0 || direction === 0) return 0.25;
    return prevDirection !== direction ? 1 : 0;
  }

  // Solves for the sequence of positions in `items` minimizing the
  // weighted cost. getOptions(item, index) must return a non-empty
  // array of objects with a numeric `position` (and optionally
  // `approximate`). Returns { positions: [...], approximate: [...],
  // cost: number }, where approximate[i] is true if note i's chosen
  // position was one of those flagged options.
  function solve(items, getOptions, weights) {
    weights = weights || {};
    var wPosition = weights.position || 0;
    var wPositionChange = weights.positionChange || 0;
    var wDirectionChange = weights.directionChange || 0;
    var wEndzone = weights.endzone || 0;

    var optionsPerItem = items.map(function (item, i) {
      var opts = getOptions(item, i);
      if (!opts || opts.length === 0) {
        throw new Error("No position options for item " + i);
      }
      return opts;
    });

    // How many of this note's OTHER options sit closer to home than the
    // given one -- 0 for a note with a single option (nothing to pass
    // up), up to (option count - 1) for the farthest of several.
    function closerOptionsPassedUp(opts, opt) {
      var count = 0;
      opts.forEach(function (other) {
        if (other.position < opt.position - 1e-9) count++;
      });
      return count;
    }

    // dp[i] is one state per (position, incomingDirection) pair
    // reachable at note i, each holding its cheapest cost so far and
    // a backpointer to the previous state that achieved it.
    var dp = [optionsPerItem[0].map(function (opt) {
      var cost = wPosition * opt.position +
        wEndzone * closerOptionsPassedUp(optionsPerItem[0], opt);
      return { position: opt.position, direction: null, approximate: !!opt.approximate, cost: cost, prev: null };
    })];

    for (var i = 1; i < optionsPerItem.length; i++) {
      var prevStates = dp[i - 1];
      // Keep the cheapest state per distinct (position, direction) pair,
      // not just per position -- a pricier way of reaching a given
      // position can still be worth keeping if its direction sets up a
      // cheaper continuation later. Collapsing straight to "cheapest
      // overall for this position" loses exactly that alternative.
      var bestByKey = {};
      optionsPerItem[i].forEach(function (opt) {
        var endzoneCost = wEndzone * closerOptionsPassedUp(optionsPerItem[i], opt);
        prevStates.forEach(function (prevState) {
          var diff = opt.position - prevState.position;
          var direction = directionOf(diff);
          var cost = prevState.cost +
            wPosition * opt.position +
            wPositionChange * Math.abs(diff) +
            wDirectionChange * directionTurnCost(prevState.direction, direction) +
            endzoneCost;
          var key = opt.position + "|" + direction;
          if (!(key in bestByKey) || cost < bestByKey[key].cost) {
            bestByKey[key] = {
              position: opt.position, direction: direction, approximate: !!opt.approximate,
              cost: cost, prev: prevState
            };
          }
        });
      });
      var states = [];
      for (var key in bestByKey) states.push(bestByKey[key]);
      dp.push(states);
    }

    var finalStates = dp[dp.length - 1];
    var best = finalStates.reduce(function (a, b) { return b.cost < a.cost ? b : a; });

    var positions = new Array(items.length);
    var approximate = new Array(items.length);
    var state = best;
    for (var j = items.length - 1; j >= 0; j--) {
      positions[j] = state.position;
      approximate[j] = state.approximate;
      state = state.prev;
    }

    return { positions: positions, approximate: approximate, cost: best.cost };
  }

  return { solve: solve };
});
