// The baking thread: asked for a figure by name, it sculpts it and grows its
// hair, and hands back the arrays. (See bake.js for the work, bakery.js for
// who asks.)
import { RECIPES } from './recipes.js';
import { bakeSteps, buffersOf } from './bake.js';

self.onmessage = (e) => {
  const { who, bare } = e.data;
  try {
    const it = bakeSteps(RECIPES[who](), { bare });
    let r = it.next();
    while (!r.done) { self.postMessage({ who, progress: r.value }); r = it.next(); }
    self.postMessage({ who, baked: r.value }, buffersOf(r.value));
  } catch (err) {
    self.postMessage({ who, error: String((err && err.stack) || err) });
  }
};
self.postMessage({ ready: true });
