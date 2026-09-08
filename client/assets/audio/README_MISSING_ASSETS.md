# Optional replacements and graceful fallback

The required DAY and NIGHT music files are included. The game does not depend on any
Freesound download or account. Existing project effects are preferred. If a music file
is removed, fails to decode, or cannot be fetched, its procedural fallback stays active;
each context fetches each file once, with no retry/404 loop per snapshot.

The following are **not imported**. They are candidate replacements only. Licenses must
be rechecked on the original page before importing and adding an entry to LICENSES.md.
Freesound can require login; this implementation did not need those downloads.

| Candidate | Original page | Proposed path under this directory | Current replacement |
| --- | --- | --- | --- |
| SLOW HEARTBEAT — daandraait | https://freesound.org/people/daandraait/sounds/249716/ | `sfx/breath/slow_heartbeat.wav` | Procedural low-frequency double beat with danger gain |
| footsteps in museum.wav — Anya_Media | https://freesound.org/people/Anya_Media/sounds/529713/ | `sfx/footsteps/museum.wav` | Existing heel variations, spatial distance / occlusion / pan |
| Museum Gallery ambience soft walla calm steps — visionear | https://freesound.org/people/visionear/sounds/563379/ | `ambience/gallery/room.wav` | Quiet procedural room tone without visitors |
| gun shot — Filmsounduser | https://freesound.org/people/Filmsounduser/sounds/804825/ | `sfx/weapon/gunshot.wav` | Existing revolver + gallery impulse |
| Distant police siren — TuneSeeker | https://freesound.org/people/TuneSeeker/sounds/802079/ | `sfx/world/distant_siren.wav` | Low-pass distant siren, four-second fade-in |
| Unsolved Investigation — isaiah658 | https://opengameart.org/content/unsolved-investigation | `music/day/suspicion_unsolved.ogg` | Deliberately omitted; a quiet drone keeps Moil as the only complete DAY mix |
| Horror Atmosphere — SubspaceAudio | https://opengameart.org/content/horror-atmosphere | `music/night/horror_atmosphere.ogg` | Deliberately omitted; only one complete NIGHT mix |

Saving optional files alone does not enable them; add their license record and a manifest/
voice mapping after auditioning. Do not add unverified licenses or a second loud full mix.

Before release, audition the procedural gasp, door, relay and siren with headphones.
The existing hall impulse is short (~0.95 seconds); it remains the gameplay SFX reverb.
