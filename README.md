# Shave the Mammoth

> Legend has it, great woolly mammoths roamed the earth, but then a legend came and
> shaved them all, and now they are elephants. That legend is you.

A first-person game in the making: you are a very small creature (an elf, perhaps)
and your job is to give one very large woolly mammoth a clean shave.

So far there is the mammoth, its coat, the light and the land around it, and three
tools to shave it with, used in first person from the elf's height: small bad
scissors, shears and garden clippers. You can also orbit the mammoth, jump between
a few views and move the sun. The game opens on its legend, told a line at a time
over the first shot of the mammoth (any key or a click skips it).

![The end of the opening: "That legend is you." over the mammoth at sunset](docs/legend.jpg)

| Small bad scissors | Shears | Garden clippers |
| --- | --- | --- |
| ![Small rusty scissors with plastic handles lying on the hide](docs/small-scissors.jpg) | ![Blade shears lying on the hide over a shorn patch](docs/shears.jpg) | ![Garden clippers lying on the hide over a shorn patch](docs/garden-clippers.jpg) |

The garden clippers in hand, before the first cut:

![The garden clippers held in front of a foreleg](docs/in-hand.jpg)

The hair that was cut, where it fell:

![Cut hair lying on the snow in front of the foot](docs/cut-hair.jpg)

| Into the sun | From elf height |
| --- | --- |
| ![Silhouette against the low sun](docs/into-the-sun.jpg) | ![Looking up from the snow](docs/elf-view.jpg) |

The coat from shaving distance, about ten centimetres from a foreleg:

![Individual hairs on the foreleg](docs/coat-close-up.jpg)

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
| Any key, a click or a tap during the opening | Skip the legend |
| **Start shaving** button, or `E` | Pick up the chosen tool at the elf's height (`Esc` or `E` puts it down) |
| Tool buttons; while shaving, `1` `2` `3` or the mouse wheel | Small bad scissors, shears, garden clippers |
| Left mouse, or `Space` | Snip. Hold to keep cutting |
| `W A S D`, `Shift`, mouse | Walk, run, look |
| `M` | Sound on or off |
| Drag / scroll | Orbit and zoom (when not shaving) |
| `1` `2` `3` `4` (when not shaving) | The mammoth, in profile, into the sun, the coat |
| `H` | Hide or show the controls |
| `P` | Frame rate, resolution, hairs on screen and which graphics card is in use |
| Sun slider | Height of the sun, from last light to mid-morning |
| Detail menu | Low, Medium, High, Ultra |

### Shaving

Walk up to the mammoth. Held away from it, a tool points ahead with its blades
level, and a snip trims whatever hair hangs between them. Press it into the coat
and it turns to lie flat on the hide, pointing up the limb, as a shearer holds
it: a snip there takes everything between the blades and the skin down to
stubble.

| Tool | Size | What it is like |
| --- | --- | --- |
| Small bad scissors | 7.5 cm, blades 3.4 cm | The pair from the back of a kitchen drawer: blunt, spotted with rust, one point snapped off, a rivet so loose the blades rattle. A bite the width of a finger. A little over half of the hair between the blades is cut; the rest folds over and slips out. What is cut is chewed off at uneven lengths, three strokes in ten stick part way, and they are slow to open again |
| Shears | 17 cm, blades 9.5 cm | Blade shears, as used on sheep for centuries: one strip of spring steel, two broad blades and a bow at the back. One hand, a quick squeeze, and the bow throws them open again with a quiver. A clean cut, closest to the skin of the three |
| Garden clippers | 27 cm, blades 13.5 cm | Hedge shears held in both hands. The biggest bite of the three, and a heavier, slower stroke |

A smaller tool also lets the elf lean in closer: the eyes stop 11.5 cm from the hide
with the scissors, 19 cm with the shears and 25 cm with the clippers. Changing tool,
the hands draw one back out of sight and come up with the other.

The blades part the hair they lie in: hair that would pass through a blade is
pushed off it, either out past its back or into the gap, where it is cut with the
rest. Steel does not pass through the hide, the toenails or the snow either; the
hands give way instead.

The hair that falls is the hair that was cut. Each lock's cut-off part goes on
being drawn from the same strand, by the same shader, and starts exactly where it
was. Then it comes away as one piece: squeezed out of the coat, it drops, turns,
and settles on the snow, where it stays. The readout at the top right shows how
much of the coat has gone.

The elf stands about 20 cm tall at the eye (the garden clippers are longer than
that), so for now only the feet, the lower legs and the tip of the trunk are
within reach.

The scene also tunes itself while it runs: if the frame rate drops it lowers the
resolution and draws less of the coat, and raises them again when there is headroom.

On a laptop with two graphics cards, check with `P` that the browser is using the
fast one. If it is not, set the browser to "High performance" under Windows
Settings > System > Display > Graphics.

## How it is built

| Part | Where | Notes |
| --- | --- | --- |
| Body | `src/mammoth/anatomy.js`, `sdf.js`, `mesher.js` | The body is a smooth blend of ellipsoids and round cones, turned into a mesh at load. The same description gives the skin weights for the skeleton and the grooming map (hair length, lift, colour) |
| Coat | `src/mammoth/groom.js`, `furMaterial.js`, `mammoth.js` | The groom stores about 240,000 guide strands at High, one per lock of hair. Each is grown in the vertex shader: it leaves the skin, bends under gravity and wind, gathers into locks, and drapes over the body using a baked distance volume. From far away one strand per lock is all the eye can resolve. As the camera approaches, each guide is drawn again and again, and every extra copy becomes a separate hair with its own root, length, curve and colour, some of them short crimped underwool. The coat is split into patches of hide about 40 cm across, so only the patches near the camera pay for this: at shaving distance roughly 600,000 individual hairs are on screen |
| Hair lighting | `furMaterial.js` | Two highlights (surface and through-the-fibre), light passing through the coat when the sun is behind it, and sunlight that soaks into the coat rather than stopping at its surface |
| Sky | `src/world/sky.js` | Rayleigh, Mie and ozone scattering baked to a lookup for the current sun; clouds and the sun's disc drawn live. The sky also supplies the ambient light, reflections and haze colour |
| Land | `src/world/terrain.js`, `grass.js`, `rocks.js`, `particles.js` | Wind-carved snow, a footprint trail, frozen grass, scattered stones, a frozen lake towards the sun, mountains, drifting ice crystals and the mammoth's breath. The mammoth stands sunk a few centimetres into the snow, which fits round each foot |
| Light and shadow | `src/gfx/` | Shadows store depth so materials can measure how much lies between them and the sun: crisp on snow, soft inside fur and grass. Three maps: the land, the mammoth, and a fine one that follows the elf |
| Tools | `src/game/tool.js`, `src/game/tools/` | `tool.js` holds what every tool shares: how it is held in front of the eyes with sway and bob, how it is laid along the hide when pressed into the coat, how a stroke runs, and how every part of it is kept out of the mammoth and the snow (each tool is a few dozen small spheres for that purpose, checked every frame). A tool itself is a definition: its parts, its size, the hold, the stroke, how well it cuts and how it sounds. The garden clippers are two identical forgings, one turned over on the other: bevelled blades, cranked tangs, brass ferrules, turned handles, a bolt and nut. The shears are a single sprung strip: blades with a ground edge, grips in chipped red paint, and a bow that flexes as they close. The scissors are thin rusty steel with moulded plastic rings and a rivet that lets the blades shiver |
| What is solid | `src/mammoth/collider.js` | The body's own description (ellipsoids and round cones) evaluated exactly, each piece carried by its bone so the swaying trunk is where it looks, with the toenails added. The baked distance volume the fur drapes over is too coarse to hold a blade a few millimetres off the skin |
| Cutting | `src/mammoth/strand.js`, `mammoth.js`, `src/game/shaving.js` | The fur is shaped on the GPU, so the same recipe is followed in JavaScript for the guide strand of each lock to find the ones between the blades. Each is cut as a blade reaches it during the stroke, by writing a shorter length for it; its hairs follow. A poor tool misses some of the locks and leaves the others at uneven lengths. The hide shows as skin where the coat is down to stubble |
| Hair and steel | `src/mammoth/furMaterial.js`, `src/game/tool.js` | The fur's vertex shader is told where the blades are and how they are shaped, and moves hair off them. As a last guarantee a tool is drawn as if a few centimetres nearer the eye than it is (5.5 cm for the clippers, 3 cm for the scissors), so any hair lying that close in front of it is hidden behind it and no strand can be seen passing through steel |
| Cut hair | `src/game/clippings.js`, `furMaterial.js` | A cut copies the strand (and the pose of the skin and the wind at that moment) into a pool drawn by a variant of the fur shader, which grows the same hairs and keeps only the part beyond the cut. That part is then moved as one rigid piece: it falls, turns, flutters, slides off the mammoth and is laid flat on the snow |
| Sound | `src/game/audio.js` | Synthesised with the Web Audio API: blades sliding and meeting, hair parting, boots in snow, wind that follows the gusts on screen. Each tool has its own voice: the clippers' wooden handles knock, the shears ring and twang as the bow opens them, the scissors tick, rattle and squeak |
| Picture | `src/gfx/post.js` | HDR rendering, bloom, light shafts, a film-style tone curve that keeps colour in the highlights, vignette and grain |
| Opening | `index.html`, `src/main.js` | The legend: its first line shows on the dark while the scene is being made, the others over the opening camera move, high in the sky where they can be read. The controls come up when it ends |

## Developer notes

- `tools/shot.mjs` renders a still in headless Chromium for visual checks, e.g.
  `node tools/shot.mjs shots/a.png "shot&q=high&view=2" 1600 900` (needs `npm run dev` running).
  Useful query options: `q` (detail), `view`, `cam=x,y,z,tx,ty,tz`, `fov`, `el` (sun height),
  `az` (sun bearing), `t` (time offset), `stats`, `elf=x,z,yaw,pitch` (start with a tool in
  hand), `tool=scissors|sheep|garden` (which one), `snips=n` with `snipyaw` (take n strokes,
  turning between them), `look=yaw,pitch`, `open` (blade angle, 0 to 1), `warm=n` (advance n
  frames first), `cutdisc=x,y,z,nx,ny,nz,r` (shear everything crossing a disc),
  `shearsat=x,y,z` (lay the tool down to look at it),
  `debugShadow`, `adapt=n` (start n notches down the automatic quality scale), `away=x` (hold the
  tool part way put away, 0 to 1), `legend=n` (hold line n of the opening legend; `nolegend` on
  the live page goes without it), `sync` (wait for the graphics side every frame: the tests use
  it, because without a graphics card frames are queued faster than they are drawn), and `debug`
  (exposes the game as `window.__game`).
- `tools/smoke.mjs` drives the live page through every control and reports script errors;
  `tools/intro-test.mjs` checks the opening legend and the ways of skipping it;
  `tools/snip-test.mjs` picks up each tool in turn and cuts with real key presses;
  `tools/collide-test.mjs` puts the elf in 3,000 places with each tool and measures whether
  any part of it ends up inside the mammoth or the snow, and whether a tool being put away
  is out of sight by the time the next one takes its place.
- `dev/body.html` shows the bare body from four sides, for working on the anatomy.
- `npm run build:artifact` writes a single page (`dist-artifact/shave-the-mammoth.html`)
  that loads three.js from a CDN.

## What comes next

1. Reaching the rest of the mammoth: climbing its coat, or something to stand on.
2. The mammoth noticing: shifting its weight, lifting a foot, turning its head.
3. More tools (something for the last few millimetres), and the elf's hands on the
   handles (they are below the frame for now).
