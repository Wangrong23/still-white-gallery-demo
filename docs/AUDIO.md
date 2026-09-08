# STILL: JAZZ → SILENCE → PULSE → SILENCE

## Changed files

- Added runtime: `client/audio-director.js`, `client/music-director.js`,
  `client/audio-model.js`, `client/audio-manifest.js`.
- Integrated/reused backend and UI: `client/audio.js`, `client/main.js`,
  `client/style.css`, `client/scene.js`, `shared/sun.js`, `server/index.js` (audio MIME).
- Removed deprecated Q implementation: `shared/game.js`, `shared/config.js`,
  `client/i18n.js`, plus the affected renderer/client files above.
- Tests: `tests/audio.test.js`, `tests/audio-browser.html`, `tests/audio-browser.js`,
  `scripts/audio-test-server.js`; updated `tests/core.test.js`, `tests/feedback.test.js`,
  `tests/still.test.js`, `tests/network.test.js`.
- Assets/provenance: `client/assets/audio/music/day/day_noir_moil.mp3`,
  `client/assets/audio/music/night/night_ambient_horror.ogg`,
  `client/assets/audio/LICENSES.md`, `client/assets/audio/README_MISSING_ASSETS.md`.
- Documentation: `README.md`, `docs/AUDIO.md`, `docs/VALIDATION.md`.

Existing audio WAV files were reused without modification. Unrelated pre-existing
workspace changes were left alone.

## Architecture and information boundary

`client/audio-director.js` orchestrates phase transitions, gain groups, public event IDs,
ambience filtering and local player sound feedback. It extends the existing `Sound`
backend in `client/audio.js`, preserving sample caching, panning, distance/occlusion and
the hall convolution impulse. `client/music-director.js` owns persistent music sources,
gain/filter automation and the fixed 96 BPM pulse. `client/audio-model.js` is a pure,
testable behavior model. `client/audio-manifest.js` owns music paths and group defaults.

Only the local player's moving/holding/breath fields, **boolean** inspection activity,
local aim input, public phase/clocks, and audible world events enter the model. It never
receives the remote player, inspection target identity, inspection progress ratio,
`game.tension()`, hit result or hidden distance. Night intensity uses time and audible
events; it does not perform visibility/radar inference. The maximum passive stationary
observation contribution is 0.12, and an aim held for eight seconds adds at most 0.16.
Inspection has a 0.66 contribution. Suspicion smooths with 0.8s attack / 3.5s release.

Holding killers and decoys have identical inspection audio while their public activity
is identical. Normal-breath detection ends under existing rules; no musical enemy-found
cue is added. Only authoritative gasp events produce the existing spatial gasp sound.
Local breathing and heartbeat are never sent over the network.

## Routing and lifecycle

MASTER contains MUSIC, AMBIENCE, SFX and UI. A pre-compressor analyser reports observed
peak in F2; a -3dB threshold / 4:1 narrow-knee compressor catches accidental high peaks.
Default group levels are 1 / .55 / .7 / .9 / .7; the existing volume and ambience settings
still apply. Normal sample SFX and their reverb share SFX gain. UI is reserved.

Contexts are created/resumed only by a real PLAY/HOST/JOIN/resume/canvas gesture, checked
against browser user activation. Snapshot delivery never creates a context. Reloaded
online sessions stay silent until the user resumes/clicks. Music is fetched/decoded once
per context. Missing assets retain generated loops. Loaded replacements fade the old
layer to zero before swapping, and do not stack complete tracks. Noise buffers are cached.
Per-frame work updates parameters; new voices are created only for actual one-shots,
breaths or beats. Menu stops one-shots and suspends the context; music loops are reused.

The existing snapshot event IDs are deduplicated again inside AudioDirector. Round reset
resets the cursor. Reconnection seeds it with the server's last event ID and current phase,
so old shots, doors and support do not replay. Phase sounds are keyed to phase transitions,
not phase events. Missed sunset cues older than 0.2s are skipped rather than replayed in a burst.
The network snapshot callback applies phase changes immediately as well as the normal
frame update, so a throttled background render loop cannot keep DAY music alive into SUNSET.

## Phase and event behavior

- PREPARATION: quiet room tone; last three seconds produce soft building chimes; DAY entry
  releases the door mechanism. No normal music is audible before DAY.
- DAY: sparse Moil gain envelope, quiet behavior-driven drone, inspection duck (-3dB)
  and softer/high-cut room sound. `lateDayAt()` is shared with the renderer's last-60s
  lighting calculation. A full stereo mix loses volume/bandwidth, not individual stems.
- SUNSET: independent music gate ramps to exactly zero in 100ms. Bell at 0.45s,
  relays at 0.8/1.2/1.6s, diminishing room tone. No TTS, crescendo or musical sting.
- NIGHT: one ambient track + fixed 96 BPM low pulse. Percussion leaves T-10→T-7,
  bass T-7→T-3, drone T-5→T-3. Footsteps, breathing and gunshots remain audible.
- Shot: existing revolver/reflections, music -11dB for 400ms. Penalty adds a 480ms
  music vacuum / nearly empty ambience, then a small mechanism sound. The server's
  existing +25s time penalty is unchanged.
- Holding: own breathing stops; room high frequencies soften, heartbeat grows with
  remaining breath, last three seconds add subtle tinnitus. Gasp uses server events
  and the existing 8m/occlusion acoustic rule, not an inferred exhaustion trigger.
- Attack: existing swipe; FOUND YOU ends music quickly with a soft low residue.
- DETECTED: gunshot/reverb when there is a shot, then quiet; no victory fanfare.
- SURVIVED: one distant siren fades in over four seconds. Existing ESCAPED and
  KILLER ESCAPED endings stay intact and do not incorrectly trigger police support.

## Quick test

`npm start`, open the local game, choose single-player. F9 disables the bot, F2 opens
the existing debug display and releases the pointer so its audio buttons can be clicked.
Use **DAY → T-60 → T-10 → SUNSET → NIGHT → NIGHT T-10**; clocks and graphics change
through the existing local authoritative Game, not an independent audio-only clock.
SUNSET naturally advances after 2.4 seconds. The existing F3/F4/F6 shortcuts still work.
Wrong Shot triggers the debug shot/penalty sequence and advances DAY by 25s.
Gunshot and Support preview those voices. Group mute buttons leave other buses intact.
Debug mutations are local-only, never sent to a production room.
Force-phase buttons revive an ended test round and move doorway players just inside
the south entrance so the existing escape rule does not immediately end a NIGHT preview.

Run `npm test` and `npm run build` for rules, security boundary, timing, lifecycle and network
regressions. `node scripts/audio-test-server.js` opens a separate **test fixture** at
http://127.0.0.1:5101. Click Run full round: it starts two independent actual AudioContexts,
tests shot/penalty dedup, decodes both imported tracks, and drives both with duplicate
20Hz snapshots. DAY is accelerated ×10; all gameplay constants, PREPARATION, SUNSET and
NIGHT durations remain unchanged. It checks the actual zero-valued SUNSET gate, final
night drain, support, pre-compressor peaks and bounded sources. This is a test page,
not a second in-game debug UI. It does not replace a real two-person listening session.

## Legacy findings

Q was blocked in the server network action path and absent from client input, but still
had a complete local implementation, renderer, config, text and obsolete tests. Those
unused gameplay parts were removed; the server rejection remains as defense for old
clients. No other gameplay values changed.

The old killer-wide heartbeat and delayed closing TTS were removed from the game audio
path. Existing closing speech files have unverified provenance and are not used. Gasp, local breathing, heart and siren now use edited CC0 Freesound samples.
Door/relay remain procedural demo sounds. The hall IR remains short;
longer professionally edited reverb/samples and subjective mix audition are future polish.


## CC0 body sounds / siren replacement (2026-09-08)

The exhaustion hiss is replaced by jawbutch’s Male Gasp 1; normal breathing alternates
two edits from dav0r’s Breathing (male). daandraait’s SLOW HEARTBEAT replaces oscillator
double beats, and TuneSeeker’s Distant police siren replaces the synthesized support cue.
All four source pages declare CC0. The publicly available HQ previews were trimmed,
filtered, faded and peak-normalized to -6dBFS; these are not lossless original downloads.
See `client/assets/audio/LICENSES.md` for exact source URLs, times and processing.

`SFX_MANIFEST` loads five buffers once per context. Recorded local breath and heart have
no gallery reverb; recorded gasp retains exactly the existing spatial acoustic rules.
Holding fades the current breath out in 35ms. Exhaustion interrupts any coincident local
breath and leaves 1.2s before the next breath, avoiding two overlapping inhalations.
All gameplay timers, range/occlusion rules, event dedup and music privacy rules are unchanged.
Missing files still use the existing procedural fallback.
F2 now also exposes **Gasp**, a local nearby preview of the actual exhaustion sound;
it does not change breath reserves or send an event to a network room.
