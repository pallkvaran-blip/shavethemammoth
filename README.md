# Shave the Mammoth

A first-person game in the making: you are a very small creature (an elf, perhaps)
and your job is to give one very large woolly mammoth a clean shave.

This first milestone is the mammoth itself, its coat, the light and the land around
it. There is no shaving yet. You can orbit the mammoth, jump between a few views,
drop down to elf height and walk around its feet, and move the sun.

It runs in the browser on three.js (WebGL 2). Everything is generated in code at
load time: there are no model, texture or sound files.

## Run it

```bash
npm install
npm run dev
```

Then open the address Vite prints (http://localhost:5173 by default).

`npm run build` writes a static site to `dist/` that can be served from anywhere.

## Controls

| Input | What it does |
| --- | --- |
| Drag / scroll | Orbit and zoom |
| `1` `2` `3` `4` | The mammoth, in profile, into the sun, the coat |
| `E` | Elf's-eye view: `W A S D` to walk, `Shift` to run, mouse to look, `Esc` to return |
| `H` | Hide or show the controls |
| `P` | Frame rate, resolution and which graphics card is in use |
| Sun slider | Height of the sun, from last light to mid-morning |
| Detail menu | Low, Medium, High, Ultra |

The scene also tunes itself while it runs: if the frame rate drops it lowers the
resolution and draws less of the coat, and raises them again when there is headroom.

On a laptop with two graphics cards, check with `P` that the browser is using the
fast one. If it is not, set the browser to "High performance" under Windows
Settings > System > Display > Graphics.

## How it is built

| Part | Where | Notes |
| --- | --- | --- |
| Body | `src/mammoth/anatomy.js`, `sdf.js`, `mesher.js` | The body is a smooth blend of ellipsoids and round cones, turned into a mesh at load. The same description gives the skin weights for the skeleton and the grooming map (hair length, lift, colour) |
| Coat | `src/mammoth/groom.js`, `furMaterial.js` | About 240,000 strands at High, each one a GPU instance grown in the vertex shader: it leaves the skin, bends under gravity and wind, gathers into locks, and drapes over the body using a baked distance volume. Close up each strand ribbon carries many individual hairs; further off it is drawn as one fine strand |
| Hair lighting | `furMaterial.js` | Two highlights (surface and through-the-fibre), light passing through the coat when the sun is behind it, and sunlight that soaks into the coat rather than stopping at its surface |
| Sky | `src/world/sky.js` | Rayleigh, Mie and ozone scattering baked to a lookup for the current sun; clouds and the sun's disc drawn live. The sky also supplies the ambient light, reflections and haze colour |
| Land | `src/world/terrain.js`, `grass.js`, `rocks.js`, `particles.js` | Wind-carved snow, a footprint trail, frozen grass, boulders, a frozen lake towards the sun, mountains, drifting ice crystals and the mammoth's breath |
| Light and shadow | `src/gfx/` | Shadows store depth so materials can measure how much lies between them and the sun: crisp on snow, soft inside fur and grass |
| Picture | `src/gfx/post.js` | HDR rendering, bloom, light shafts, a film-style tone curve that keeps colour in the highlights, vignette and grain |

Shaving is designed in from the start: every strand's length is a per-strand value
on the GPU, so cutting hair means writing shorter lengths where the clippers pass.

## Developer notes

- `tools/shot.mjs` renders a still in headless Chromium for visual checks, e.g.
  `node tools/shot.mjs shots/a.png "shot&q=high&view=2" 1600 900` (needs `npm run dev` running).
  Useful query options: `q` (detail), `view`, `cam=x,y,z,tx,ty,tz`, `fov`, `el` (sun height),
  `az` (sun bearing), `elf` (start at elf height), `t` (time offset), `stats`.
- `dev/body.html` shows the bare body from four sides, for working on the anatomy.
- `npm run build:artifact` writes a single page (`dist-artifact/shave-the-mammoth.html`)
  that loads three.js from a CDN.

## What comes next

1. The coat from elf distance: denser hair near the camera and a proper skin surface underneath.
2. Clippers and cutting: shorten strands where the blade passes, loose tufts falling away.
3. Climbing on the mammoth, and the mammoth reacting.
4. Sound.
