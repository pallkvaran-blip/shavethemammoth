# Shave the Mammoth

> Legend has it, great woolly mammoths roamed the earth, but then a legend came and
> shaved them all, and now they are elephants. That legend is you.

A first-person game: you are an elf twenty centimetres tall, and your job is to give
one very large woolly mammoth a clean shave.

You start with nothing but a pair of small bad scissors. The hair you cut is worth
gold to Mortimer, a vulture in the wig trade; gold buys better tools, brooms and
vacuum cleaners, ladders and jet packs from Gnorman, a gnome who is the mammoth's
biggest fan and keeps a stall beside him. The more of the mammoth you can reach, the
more there is to cut, and the more of what is under the coat comes to light. He has
tattoos. He is also wearing something.

The game opens on its legend, told a line at a time over the first shot of the
mammoth (any key or a click skips it). It keeps itself in the browser between visits.

![The end of the opening: "That legend is you." over the mammoth at sunset](docs/legend.jpg)

## The elf

| Waiting to start | A new tool |
| --- | --- |
| ![A small elf in a striped hat looking up at the mammoth's legs](docs/the-elf.jpg) | ![The elf holding a pair of shears over his head, light bursting behind them, under the words "You got the Shears!"](docs/you-got-shears.jpg) |

Most of the time you look out of his eyes and see only his shadow. Whenever he gets
a new cutting tool the game stops to admire it: the camera steps outside him, he
thrusts it over his head, a fanfare plays, and the camera goes once round him and
back in through his hat. Each tool gets the scene it deserves. The garden clippers
are bigger than he is:

![The elf straining to hold a pair of garden clippers over his head like a barbell](docs/you-got-clippers.jpg)

## The traders

| Gnorman | Mortimer |
| --- | --- |
| ![A fat gnome with a fan on his hat and a foam finger, behind a striped stall](docs/gnorman.jpg) | ![A vulture in a ruff, a monocle and a ginger toupee, behind a table of wigs and a pair of scales](docs/mortimer.jpg) |

![Gnorman's list of wares, with prices in gold](docs/shop.jpg)

### How they are made

![The elf, Gnorman and Mortimer, close to](docs/faces.jpg)

The three of them are made the way the mammoth is: in code, when the game starts,
with no models or pictures loaded. Each is designed as layers of soft solids blended
together (skin, and every garment a layer of its own), with pieces carved out for
nostrils, eye sockets and the hollow of an ear. That design is turned into a fine
mesh hung on bones, and every point of it is told how much of the sky it can see
(so creases are dark), how thin the flesh is there (so the elf's ears glow when the
sun is behind them) and where it lies round and along its limb (so knitting can
follow it). Clothes are knitted, woven or tanned in their materials stitch by
stitch: Gnorman's creed is worked into the back of his jersey one stitch at a time.
Beards, eyebrows, the bobble on a hat, the ruff and the toupee are hair, strand by
strand; Mortimer's coat is some thousands of feathers laid like tiles, each with a
shaft, barbs and the odd split in its vane.

All of that is some seconds of arithmetic for each of them. It is done on threads of
its own while the land and the mammoth are being made, so the wait is no longer for
it; where a page does not allow threads it is done between frames instead.

## Under the coat

![A patch shaved on his flank, showing a butcher's chart and a heart with MUM across it](docs/under-the-coat.jpg)

| Close to | From behind |
| --- | --- |
| ![A barcode on a hind leg: BEST BEFORE END OF ICE AGE](docs/tattoo.jpg) | ![The mammoth shaved, from behind and above: a pink thong, and several regrettable tattoos](docs/thong.jpg) |

## Getting up there, and other purchases

| Up a ladder | Picking it up | Sundries |
| --- | --- | --- |
| ![Looking down from a ladder past the garden clippers at the hair of a foreleg](docs/ladder.jpg) | ![A push broom held out over the snow](docs/broom.jpg) | ![The mammoth dyed pink, in a party hat and sunglasses](docs/pink.jpg) |

## The tools

| Small bad scissors | Shears | Garden clippers |
| --- | --- | --- |
| ![Small rusty scissors with plastic handles lying on the hide](docs/small-scissors.jpg) | ![Blade shears lying on the hide over a shorn patch](docs/shears.jpg) | ![Garden clippers lying on the hide over a shorn patch](docs/garden-clippers.jpg) |

| Electric shears | Beard shaver |
| --- | --- |
| ![An electric shearing handpiece at the head of the strip it has cut up a foreleg](docs/electric-shears.jpg) | ![A small black beard trimmer on the hide, its button ring lit, bare skin behind it](docs/beard-shaver.jpg) |

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
| Any key, a click or a tap during the opening or a scene | Skip it |
| **Start shaving** button, or `E` | Climb down to the snow with the tool last used (`Esc` stops) |
| Left mouse, or `Space` | Cut. Hold to keep cutting (an electric tool runs for as long as it is held). With a broom or a vacuum in hand, gather |
| `W A S D`, `Shift`, mouse | Walk, run, look |
| `1` to `5`, the mouse wheel, or the tool buttons | The cutting tools you own |
| `Q` | Swap between cutting and picking up |
| `E` | Talk to Gnorman or Mortimer when standing at their stalls (`E` or `Esc` leaves) |
| `R`, or the right mouse button | Up: stand the ladder where you are and climb it, or burn the jet pack |
| `F` | Down. At the bottom of the ladder, puts it away |
| `A` `D` on a ladder | Walk the ladder sideways |
| `T` | With a ladder and a pack both, change which of them `R` works |
| `M` | Sound on or off |
| Drag / scroll | Orbit and zoom (when not shaving) |
| `1` `2` `3` `4` (when not shaving) | The mammoth, in profile, into the sun, the coat |
| `H` | Hide or show the controls |
| `P` | Frame rate, resolution, hairs on screen and which graphics card is in use |
| Sun slider, Detail menu | Height of the sun; Low, Medium, High, Ultra |
| **New game** (asks twice) | Gives him his coat back and takes everything you have |

By touch there are buttons for walking, cutting, going up and coming down; drag to
look, and tap the prompt that appears at a stall to talk.

## The game

**Hair into gold.** Every lock you cut falls as itself and lies on the snow until it
is picked up (`Q`, look at it, hold the cut button). Your pockets hold 100 g. Mortimer
pays 25 gold the hundred grams. The whole coat is about 70 kg.

**Gnorman's stall.**

| | Gold | |
| --- | --- | --- |
| Shears, garden clippers, beard shaver, electric shears | 15, 120, 300, 600 | Each cuts more, or closer, than the last. A minute of work: about 25 g with the bad scissors, 200 to 300 g with the shears or the clippers, and as much as you can sweep with the electric ones |
| Twig broom, push broom | 10, 80 | Gather what is under the head of the broom at each stroke |
| Hand vacuum, shop vacuum; more suck | 350, 1000; 250, 600 | Hair flies up the nozzle from a distance |
| Sack, wheelbarrow, bottomless sack | 30, 180, 600 | Carry 350 g, 1.2 kg, 5 kg |
| Milk crate, step ladder, painter's ladder, fire brigade ladder | 20, 90, 300, 800 | Reach 0.45, 1.05, 2.05 and 3.75 m off the snow. He is 3.2 m at the top of his head |
| Fizzy-pop rocket belt, leaf-blower pack, jet pack; bigger tanks | 500, 1200, 2600; 350, 800 | One short violent hop; six seconds of steady lift; a pack that holds you where you are. All fill up again on the ground. You can land on his back and work there |
| Regrowth tonic | 150 | It all grows back, and you keep what you bought |
| Loyalty card, rabbit's foot, cocoa | 100, 150, 60 | A tenth off; Mortimer pays 15% more; you walk a quarter faster |
| Mystery box, party hat, sunglasses, a bucket of pink | 40, 80, 140, 400 | Nobody needs these |

**Under the coat** there are twenty-two tattoos and a pink thong, drawn on the hide and
visible only where the hair is off. Each is announced when enough of it is uncovered,
and Gnorman pays for the gossip. The beard shaver is the tool that makes them easy to
read.

**He notices.** He rumbles, breaks wind (sooner if you stand behind him), and sneezes
on anyone who loiters in front of his trunk. When he is bald the shaving stops and the
legend is told to its end; you can leave him as he is or grow it all back and go again.

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
| Garden clippers | 27 cm, blades 13.5 cm | Hedge shears held in both hands. The biggest bite of the hand tools, and a heavier, slower stroke |
| Electric shears | 18 cm, comb 5.5 cm | A cordless shearing handpiece: a comb of thirteen teeth that slides along the skin, and a four-pointed cutter thrown from side to side across it. No stroke: hold it on, lay it on the hide and push. It takes a strip the width of the comb, leaves three to five millimetres of stubble, and is hard to outrun |
| Beard shaver | 9 cm, head 2.4 cm | A small trimmer from beside a bathroom mirror. The only tool that leaves bare skin. On stubble it glides; in a full coat its little motor labours, its note sags, and hair it is pushed past faster than it can cut is left standing |

A smaller tool also lets the elf lean in closer: the eyes stop 11.5 cm from the hide
with the scissors, 12 cm with the beard shaver, 19 cm with either kind of shears and
25 cm with the clippers. Changing tool, the hands draw one back out of sight and
come up with the other.

The quick way to a clean shave is in two passes: the electric shears to take the
coat off, then the beard shaver over the stubble. Where the hide has been shaved
right down it shows smooth and a little pinker, without the dark dots of cut hairs.

The blades part the hair they lie in: hair that would pass through a blade is
pushed off it, either out past its back or into the gap, where it is cut with the
rest. Steel does not pass through the hide, the toenails or the snow either; the
hands give way instead.

The hair that falls is the hair that was cut. Each lock's cut-off part goes on
being drawn from the same strand, by the same shader, and starts exactly where it
was. Then it comes away as one piece: squeezed out of the coat, it drops, turns,
and settles on the snow, where it stays. The readout at the top right shows how
much of the coat has gone.

The elf stands about 20 cm tall (the garden clippers are longer than that), so from
the snow only the feet, the lower legs and the tip of the trunk are within reach.
The rest wants a ladder or a pack. Off the ground the hide stops him in every
direction, and where it is underneath him it holds him up.

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
| Tools | `src/game/tool.js`, `src/game/tools/` | `tool.js` holds what every tool shares: how it is held in front of the eyes with sway and bob, how it is laid along the hide when pressed into the coat, how a stroke runs, how a motor runs, and how every part of it is kept out of the mammoth and the snow (each tool is a few dozen small spheres for that purpose, checked every frame). A tool itself is a definition: its parts, its size, the hold, the stroke, how well it cuts and how it sounds. The garden clippers are two identical forgings, one turned over on the other: bevelled blades, cranked tangs, brass ferrules, turned handles, a bolt and nut. The shears are a single sprung strip: blades with a ground edge, grips in chipped red paint, and a bow that flexes as they close. The scissors are thin rusty steel with moulded plastic rings and a rivet that lets the blades shiver |
| What is solid | `src/mammoth/collider.js` | The body's own description (ellipsoids and round cones) evaluated exactly, each piece carried by its bone so the swaying trunk is where it looks, with the toenails added. The baked distance volume the fur drapes over is too coarse to hold a blade a few millimetres off the skin |
| Cutting | `src/mammoth/strand.js`, `mammoth.js`, `src/game/shaving.js` | The fur is shaped on the GPU, so the same recipe is followed in JavaScript for the guide strand of each lock to find the ones between the blades. Each is cut as a blade reaches it during the stroke, by writing a shorter length for it; its hairs follow. A poor tool misses some of the locks and leaves the others at uneven lengths. An electric tool is asked every frame instead, which needs a much quicker search: it looks only at locks rooted in the mouth of its comb (and, held in the air, at a sixth of the locks that might hang into it, a different sixth each frame). It can cut only so much a second; pushed faster than that through long hair it bogs down and leaves some standing. The hide shows as skin where the coat is down to stubble |
| Hair and steel | `src/mammoth/furMaterial.js`, `src/game/tool.js` | The fur's vertex shader is told where the blades are and how they are shaped, and moves hair off them. As a last guarantee a tool is drawn as if a few centimetres nearer the eye than it is (5.5 cm for the clippers, 3 cm for the scissors), so any hair lying that close in front of it is hidden behind it and no strand can be seen passing through steel |
| Cut hair | `src/game/clippings.js`, `furMaterial.js` | A cut copies the strand (and the pose of the skin and the wind at that moment) into a pool drawn by a variant of the fur shader, which grows the same hairs and keeps only the part beyond the cut. That part is then moved as one rigid piece: it falls, turns, flutters, slides off the mammoth and is laid flat on the snow |
| Sound | `src/game/audio.js` | Synthesised with the Web Audio API: blades sliding and meeting, hair parting, boots in snow, wind that follows the gusts on screen, coins, a fanfare for a new tool (and a deflating one for the bad scissors), the packs, and the mammoth's own noises. Each tool has its own voice: the clippers' wooden handles knock, the shears ring and twang as the bow opens them, the scissors tick, rattle and squeak. The electric tools hum for as long as they run, with the clatter of the cutter in step, and their note sags under load |
| The game | `src/game/game.js`, `state.js`, `catalog.js` | What is owned, the gold, the sack, the two shops, the advice given once each when it is first needed, and what is kept in the browser between visits. The haircut is kept twice: lock by lock, which is exact but only fits a coat of the same detail, and point by point of the hide, which fits any. `catalog.js` is everything Gnorman sells, with a note on how the prices were set from measured cutting rates |
| Picking up | `src/game/tools/sweepers.js`, `clippings.js` | Hands, two brooms and two vacuums are tools like the others, held the same way; the brooms keep to the ground whichever way the eyes are turned. Each fallen piece carries the grams it stands for. A vacuum pulls pieces up its nozzle one by one |
| The elf | `src/game/people/elf.recipe.js`, `elf.js`, `src/game/hero.js` | The player's character: sculpted, skinned and dressed (see the next row but one). He can hold a thing up in one hand or two, strain under it, be shaken by it and be let down by it. Looked out of, only his shadow is drawn. `hero.js` plays the scene for a new tool: where he stands (clear of the stall or the mammoth), what he does with each tool, the light behind it, and the camera's path once round him and back into his head |
| The traders | `src/game/people/gnome.recipe.js`, `gnome.js`, `vulture.recipe.js`, `vulture.js`, `model.js` | Gnorman and his stall, Mortimer and his table (whose wigs are hair, like his toupee); they turn to watch whoever comes by. A beard goes with the chin it grows from, but what lies on the belly stays lying there when the head turns |
| How people are made | `src/game/people/sculpt.js`, `bake.js`, `bakery.js`, `bake.worker.js`, `rig.js`, `figure.js`, `materials.js`, `strands.js`, `locks.js`, `feathers.js`, `plumes.js` | A figure is designed in a `*.recipe.js`: bones, layers of solids (the mammoth's own kit of ellipsoids and round cones, with rings, boxes and flat blades added), what is painted on the skin, where hair and feathers grow and how. `bake.js` turns that into meshes (with skin weights, occlusion, thinness and round-and-along coordinates for each point), strands and feathers; it is plain arithmetic, and `bakery.js` runs it on a worker for each figure, falling back to the page itself a piece at a time. `rig.js` and `figure.js` hang the result on bones. `materials.js` is skin (pores, freckles, light that soaks in and comes through thin parts), knitting (stocking stitch and ribbing, stripes by the row, pictures by the stitch), felt, corduroy, leather, horn and eyes, each worked out per pixel from where the point is on the figure at rest. `locks.js` draws hair as the mammoth's is drawn; `plumes.js` draws a feather on a strip a few faces long |
| Getting up | `src/controls.js`, `src/game/lift.js` | The elf has a height above the snow. A ladder is stood up under him and climbed (it is drawn only as high as his feet, so it is never between him and the hair); a pack burns what is in its tank. `lift.js` is what is seen and heard of it: the ladders, the packs on his back, what comes out of them, the gauge |
| Under the coat | `src/mammoth/tattoos.js`, `bodyMaterial.js`, `src/game/finds.js` | Twenty-two tattoos drawn in code on one sheet of ink, each projected onto the hide where it belongs (found by walking in from outside until the skin is met); and a thong, which is a formula. The skin's shader shows both only where the hair is off. Bare hide is a pavement of cracked plates, as an elephant's is |
| Antics | `src/game/antics.js` | What he does while he is being shaved, what he can be made to wear, the remarks at each milestone, and the end |
| Picture | `src/gfx/post.js` | HDR rendering, bloom, light shafts, a film-style tone curve that keeps colour in the highlights, vignette and grain |
| Opening | `index.html`, `src/main.js` | The legend: its first line shows on the dark while the scene is being made, the others over the opening camera move, high in the sky where they can be read. The controls come up when it ends |

## Developer notes

- `tools/shot.mjs` renders a still in headless Chromium for visual checks, e.g.
  `node tools/shot.mjs shots/a.png "shot&q=high&view=2" 1600 900` (needs `npm run dev` running).
  Useful query options: `q` (detail), `view`, `cam=x,y,z,tx,ty,tz`, `fov`, `el` (sun height),
  `az` (sun bearing), `t` (time offset), `stats`, `elf=x,z,yaw,pitch` (start with a tool in
  hand), `tool=scissors|sheep|garden|electric|shaver` (which one), `snips=n` with `snipyaw`
  and `snippitch` (take n strokes, turning between them; an electric tool is run that far
  instead), `look=yaw,pitch`, `open` (blade angle, 0 to 1), `warm=n` (advance n
  frames first), `cutdisc=x,y,z,nx,ny,nz,r` (shear everything crossing a disc),
  `shearsat=x,y,z` (lay the tool down to look at it),
  `debugShadow`, `adapt=n` (start n notches down the automatic quality scale), `fixed` (stay
  there, however slow the frames), `away=x` (hold the
  tool part way put away, 0 to 1), `legend=n` (hold line n of the opening legend; `nolegend` on
  the live page goes without it), `sync` (wait for the graphics side every frame: the tests use
  it, because without a graphics card frames are queued faster than they are drawn), `bare`
  (leave the land undrawn: most of what makes a frame slow without a graphics card),
  `debug` (exposes the game as `window.__game`), `unlock` (own everything, and no scenes; stills
  always do), `gold=n`, `fresh` (ignore a kept game), `nosave` (keep nothing), `noscene`,
  `scene=<tool>` with `st=<seconds>` (the scene for getting that tool, stopped at that moment),
  `lift=<ladder or pack>` with `up=<metres>` (start that far off the snow on it), `bald` (the
  whole coat off at once), `shave=x,y,z,r` (the coat off within r of a point; several separated
  by semicolons), `wear=partyhat,shades` and `pink`.
- `tools/loop-test.mjs` plays the whole game through on the live page: the first scene, cutting,
  picking up by hand, selling, buying, the scene for a new tool, every broom and vacuum, a full
  sack, a ladder, the packs, landing on his back, everything under the coat, the ending, and
  saving and loading. It steps the game itself rather than waiting for frames, so it is quick.
- `tools/smoke.mjs` drives the live page through every control and reports script errors;
  `tools/intro-test.mjs` checks the opening legend and the ways of skipping it;
  `tools/snip-test.mjs` picks up each tool in turn and cuts with real key presses;
  `tools/collide-test.mjs` puts the elf in 3,000 places with each tool and measures whether
  any part of it ends up inside the mammoth or the snow, and whether a tool being put away
  is out of sight by the time the next one takes its place.
- `dev/body.html` shows the bare body from four sides, for working on the anatomy.
- `dev/folk.html` shows one of the people (or all three) on bare snow under the game's own sky,
  for working on them: `who=elf|gnome|vulture|all`, `cam`, `fov`, `el`, `az`, `turn` (degrees),
  `bare` (no hair or feathers), and for the elf his poses (`lift`, `two`, `strain`, `buzz`, `sad`,
  `proud`, `walk`, `carry`, each 0 to 1). On the game itself, `nothreads` has the people made on
  the page instead of on workers.
- `npm run build:artifact` writes a single page (`dist-artifact/shave-the-mammoth.html`)
  that loads three.js from a CDN.

## What comes next

1. The mammoth moving: shifting his weight, lifting a foot, turning his head to look.
2. The elf's hands on the handles in first person (they are below the frame for now).
3. More to do with the hair: Mortimer's wigs changing with what he has been sold.
