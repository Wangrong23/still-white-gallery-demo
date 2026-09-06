# Noir art sources

Direction: monochrome, minimal, slightly unsettling; 1930s Art Deco exhibition and crime-film lighting.

- `noir-parts.blend`: original low-poly mesh templates, made in Blender 5.0.1.
- `../scripts/make-noir-assets.py`: reproducible source for the Blender scene, runtime geometry module and four mono PCM effects.
- `../client/noir.js`: original canvas exhibition prints and instanced skylight strips.
- `../client/assets/`: generated runtime meshes and heel, revolver, plaster and bell sounds. Build copies these into `dist/client/assets`.

No third-party meshes, recordings, fonts or textures were downloaded. These assets are original project work and require no external attribution. Rebuild using Blender's background mode and the generator script. Browser users do not need Blender.

The runtime uses independently transformed body parts, not a skinned skeleton. Meshes fit the existing unit hit bounds; killer and decoys share templates and materials. Printed figures are decorative. Collision still uses oriented boxes, including approximate heads. The `.blend` stores unit templates (overlapping at the origin); select a named object and isolate it to edit. Re-export changes through the generator or extend its profiles.

Footsteps, gun, breakage and bell are offline synthesized WAV assets. Breath, heartbeat and room noise remain Web Audio synthesis. Closing speech uses the browser's Chinese/English TTS voice and falls back to the bell when unavailable. Final performed voice acting, motion capture and multiplayer balance are outside this art pass.

Gameplay constraint: wall surfaces must remain uninterrupted and monochrome. Do not add contrasting skirting, wainscoting or trim. Daylight shading uses a black unlit endpoint and no ambient fill, shared by characters and architecture; never highlight the local killer independently.
