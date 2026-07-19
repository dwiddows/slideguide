/**
 * Turns ABC notation text (https://abcnotation.com) into the note
 * objects this app already works with -- {letter, accidental, octave}
 * -- plus a duration (as a fraction of a whole note) per note, so a
 * player can type or paste in any melody instead of only playing
 * generated scales/arpeggios.
 *
 * Parsing itself is delegated to abcjs (abcjs-basic-min.js, loaded as
 * a global ABCJS); this module's job is just bridging abcjs's own
 * pitch/duration representation into ours:
 *   - abcjs reports each note's "pitch" as a diatonic step count with
 *     0 at middle C (uppercase "C" with no octave marks) and +/-7 per
 *     octave apostrophe/comma -- exactly the same diatonic-step idea
 *     as this app's own absoluteLetterIndex, just anchored at a
 *     different zero point (music-theory.js's C4 vs abcjs's "C").
 *   - abcjs does NOT resolve a note's actual sounding accidental for
 *     us: a plain "F" in a key that sharpens F, or a plain repeat of a
 *     note explicitly sharped earlier in the same measure, both come
 *     back with no accidental info at all -- only the token actually
 *     written carries one. Real notation's own rule (key signature by
 *     default, overridden by an explicit accidental for the rest of
 *     that measure, then reset at the next barline) has to be applied
 *     by hand here, walking the note stream in order.
 *
 * Rests (z/x/Z/X -- ABCJS resolves multi-measure Z/X's duration against
 * the tune's own time signature for us, so they need no special-casing
 * here) come back as `null` in the notes array, with their real
 * duration in the parallel durations array -- a timed gap, not a
 * dropped event. Callers that hand notes to something pitch-specific
 * (the trombone position solver, key-signature/accidental logic) need
 * to filter nulls out first; callers doing layout or timing (staff
 * spacing, playback) want them left in, since that's exactly what
 * makes the gap take up real time and real horizontal space.
 *
 * Works as a plain global (<script src="abc-import.js">) in the
 * browser and as a CommonJS module under Node, same as this project's
 * other files.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(typeof ABCJS !== "undefined" ? ABCJS : require("./abcjs-basic-min.js"));
  } else {
    root.AbcImport = factory(root.ABCJS);
  }
})(typeof self !== "undefined" ? self : this, function (ABCJS) {
  "use strict";

  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

  // abcjs's diatonic "pitch" is 0 at middle C (this app's C4); its own
  // absoluteLetterIndex equivalent is octave*7 + letterIndex, so C4 is
  // 4*7+0 = 28 -- the constant offset between the two systems.
  var ABCJS_PITCH_TO_C4_OFFSET = 28;

  var ACCIDENTAL_SEMITONES = { sharp: 1, flat: -1, natural: 0, dblsharp: 2, dblflat: -2 };

  function noteFromAbcjsPitch(pitchInfo, accidentalSemitones) {
    var absoluteLetterIndex = pitchInfo.pitch + ABCJS_PITCH_TO_C4_OFFSET;
    var letterIndex = ((absoluteLetterIndex % 7) + 7) % 7;
    var octave = Math.floor(absoluteLetterIndex / 7);
    return { letter: LETTERS[letterIndex], accidental: accidentalSemitones, octave: octave };
  }

  // The key signature's own implied accidental per letter, as abcjs
  // already computed it (tune.lines[].staff[].key.accidentals) --
  // rather than re-deriving sharps/flats from the key name ourselves.
  function keySignatureAccidentalsByLetter(key) {
    var byLetter = {};
    (key.accidentals || []).forEach(function (a) {
      byLetter[a.note.toUpperCase()] = ACCIDENTAL_SEMITONES[a.acc];
    });
    return byLetter;
  }

  function keySignatureCounts(key) {
    var flats = 0, sharps = 0;
    (key.accidentals || []).forEach(function (a) {
      if (a.acc === "flat") flats++;
      if (a.acc === "sharp") sharps++;
    });
    return { flats: flats, sharps: sharps };
  }

  // Parses one voice's element stream into notes+durations, applying
  // real notation's accidental rule: each letter starts a measure at
  // whatever the key signature says, an explicit accidental on a note
  // overrides that letter for the rest of the measure, and the next
  // barline resets everything back to the key signature.
  function resolveVoice(voice, key) {
    var keyDefaults = keySignatureAccidentalsByLetter(key);
    var currentByLetter = {};
    function resetToKeySignature() { currentByLetter = {}; }
    resetToKeySignature();

    var notes = [];
    var durations = [];
    voice.forEach(function (el) {
      if (el.el_type === "bar") {
        resetToKeySignature();
        return;
      }
      if (el.el_type !== "note") return;
      if (el.rest) {
        notes.push(null);
        durations.push(el.duration);
        return;
      }
      var pitchInfo = el.pitches[0]; // chords: just the top/only note
      var letter = LETTERS[((pitchInfo.pitch % 7) + 7) % 7];
      var accidental;
      if (pitchInfo.accidental) {
        accidental = ACCIDENTAL_SEMITONES[pitchInfo.accidental];
        currentByLetter[letter] = accidental;
      } else if (letter in currentByLetter) {
        accidental = currentByLetter[letter];
      } else {
        accidental = keyDefaults[letter] || 0;
      }
      notes.push(noteFromAbcjsPitch(pitchInfo, accidental));
      durations.push(el.duration);
    });
    return { notes: notes, durations: durations };
  }

  // Parses ABC text into { notes, durations, keySignature }, reading
  // only the first tune and first voice -- this app plays one melodic
  // line, not a multi-part score.
  function parseAbcMelody(abcText) {
    var tunes = ABCJS.parseOnly(abcText);
    if (!tunes || tunes.length === 0 || (tunes[0].parseErrors && tunes[0].parseErrors.length)) {
      throw new Error("Could not parse ABC notation");
    }
    var tune = tunes[0];

    // A line break in the source isn't a musical event, just layout --
    // concatenate every music line's first staff/voice into one
    // continuous element stream so accidental state (and duration
    // totals) carry across line breaks the same as they would across
    // an unbroken line.
    var musicLines = tune.lines.filter(function (line) { return line.staff && line.staff[0]; });
    if (musicLines.length === 0) {
      throw new Error("No playable voice found in this tune");
    }
    var key = musicLines[0].staff[0].key;
    var voice = musicLines.reduce(function (elements, line) {
      return elements.concat(line.staff[0].voices[0] || []);
    }, []);

    var resolved = resolveVoice(voice, key);
    if (!resolved.notes.some(function (n) { return n !== null; })) {
      throw new Error("No notes found in this tune");
    }
    return {
      notes: resolved.notes,
      durations: resolved.durations,
      keySignature: keySignatureCounts(key)
    };
  }

  return { parseAbcMelody: parseAbcMelody };
});
