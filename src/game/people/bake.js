// Baking a figure: turning its design (layers of soft solids, and where hair
// is to grow) into the meshes and strands that get drawn. It is the slow part
// of making one, some seconds of arithmetic, and none of it needs the page:
// so it is written to run on another thread (bake.worker.js) while the game
// loads, or, failing that, a piece at a time between frames.
//
// A recipe is { bones, layers: { name: Sculpt }, cells: { name: metres },
// skin: [names of the layers that are skin], paint: { name: function },
// hair: { name: (data) => strands } }. What comes out is
// { data: { name: a layer's mesh }, hair: { name: strands } }: plain arrays.
import { meshLayer } from './sculpt.js';

/** The work, a piece at a time: yields how far along it is (0..1) after each piece, and returns the baked figure. */
export function* bakeSteps(recipe, { bare = false } = {}) {
  const names = Object.keys(recipe.layers), all = Object.values(recipe.layers), skin = recipe.skin || [];
  // each layer is shaded by all of them; and what of the skin the clothes cover is left out
  const everything = (x, y, z) => { let d = 0.04; for (const l of all) { const v = l.within(x, y, z, 0.04); if (v < d) d = v; } return d; };
  const clothes = names.filter((n) => !skin.includes(n)).map((n) => recipe.layers[n]);
  const covered = (x, y, z) => { let d = 0.01; for (const l of clothes) { const v = l.within(x, y, z, 0.01); if (v < d) d = v; } return d; };
  const rig = { index: new Map(recipe.bones.map((b, i) => [b.name, i])) };
  const growing = bare || !recipe.hair ? [] : Object.keys(recipe.hair);
  const total = names.length + growing.length;
  let done = 0;
  const data = {}, hair = {};
  for (const n of names) {
    data[n] = meshLayer(recipe.layers[n], {
      cell: (recipe.cells && recipe.cells[n]) || 0.0015, rig, occluder: everything, buried: skin.includes(n) ? covered : null,
      paint: (recipe.paint && recipe.paint[n]) || null, thin: recipe.thin ?? 0.007, weightRadius: recipe.weightRadius ?? 0.012,
    });
    yield ++done / total;
  }
  for (const n of growing) {
    hair[n] = recipe.hair[n](data);
    yield ++done / total;
  }
  return { data, hair };
}

/** All of it at once. */
export function bakeFigure(recipe, opts) {
  const it = bakeSteps(recipe, opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** The memory a baked figure is in (so that it can be handed from one thread to another without being copied). */
export function buffersOf(baked) {
  const out = new Set();
  for (const group of [baked.data, baked.hair]) for (const piece of Object.values(group)) for (const v of Object.values(piece)) if (ArrayBuffer.isView(v)) out.add(v.buffer);
  return [...out];
}
