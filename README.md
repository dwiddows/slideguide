SlideGuide calculates ideal slide positions for trombone lines.

There's an online interactive version at https://dwiddows.github.io/slideguide/
(also embedded at https://www.puttypeg.net/music/trombone/index.html).

Feel free to use any of the code in this repo for other projects,
e.g., the music theory parts that generates the scales could easily be used in tools for other instruments.

## How it works

**The problem.** Most notes on a trombone can be played in more than one slide
position: a pitch comes from the slide length *and* which harmonic (partial)
of that length's overtone series you buzz, so different combinations often
land on the same note. Picking one changes how far the slide travels, how
often it changes direction, and how close to the bell it sits.

**The position model.** Position 1's fundamental is the horn's pedal B♭; each
position down lowers that fundamental by a semitone, and each fundamental
carries its own harmonic series (`trombone-positions.js`). This is derived
from the acoustics directly, not a lookup table -- including a physically
motivated correction for the naturally flat 7th partial (shortening the slide
about a quarter position to compensate, the same way a player would by ear),
and excluding the one case where that correction can't actually happen
(partial 7 at position 1, the slide fully closed, with nowhere left to
shorten).

**Music theory.** Scales, arpeggios, and their key signatures (`music-theory.js`)
are generated from formulas -- semitone/letter-offset pairs per degree --
rather than hardcoded per key. This is the general-purpose part that's likely
reusable well beyond trombones.

**The solver.** Given a note with several playable positions, `solver.js`
scores every candidate on four things:

| Weight | Meaning |
|---|---|
| Position | Prefer a low position number ("closer to the bell") |
| Position exponent | Makes 5th-7th position disproportionately costlier than 1st-4th, rather than everything scaling together |
| Position change | Prefer less total slide travel between notes |
| Direction change | Prefer fewer reversals of slide direction |

A locally cheapest choice for one note can force an expensive one at the
next, so it's a dynamic program over the whole passage, not a greedy
note-by-note pick: it tracks the cheapest running total for every
(position, incoming-direction) state reachable at each note, carrying
forward whichever paths could still turn out cheapest overall.

**Melody input.** `abc-import.js` bridges [ABC notation](https://abcnotation.com)
(parsed by [abcjs](https://abcjs.net)) into the same note representation, so
a typed-in tune plays through the identical position solver as a generated
scale -- including real accidental resolution (key signature, then
explicit-accidental-holds-till-the-barline) and per-note durations.

**Tests.** `*.test.js` files run directly under `node` (`node music-theory.test.js`,
etc.) -- around 200 assertions covering the theory engine, the harmonic
position model, the solver (including brute-force verification against the
DP), and the ABC bridge.

**The harmonic series and the bell (`theory.html`).** A companion page
demonstrating the physics behind the position model: the pedal-to-high-B♭
natural harmonic series on a staff, an animated standing wave in a plain
tube, and (`pipe-bell.js`/`horn-equation.js`) a numerical solution of the
Webster horn equation showing how a flared bell pulls the even harmonics
back into a tube that would otherwise, closed at one end, only resonate
at odd multiples of its fundamental.

## References

- Braden, A. (2006). [Bore Optimisation and Impedance Modelling of Brass
  Musical Instruments](https://www.acoustics.ed.ac.uk/wp-content/uploads/Theses/Braden_Alistair__PhDThesis_UniversityOfEdinburgh_2006.pdf)
  (PhD thesis, University of Edinburgh) -- real brass bells fit to the
  same Bessel-horn family `pipe-bell.js` uses schematically.
