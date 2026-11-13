// Getting the people baked while the rest of the game loads. Each figure is
// some seconds of arithmetic (bake.js); given the chance it is done on threads
// of its own, so that the loading does not wait for it. Where threads are not
// to be had (some pages forbid them), it is done here instead, a piece at a
// time, so that the page stays alive.
import BakeWorker from './bake.worker.js?worker&inline';
import { RECIPES } from './recipes.js';
import { bakeSteps } from './bake.js';

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Bake one figure on this thread, letting the page breathe between the pieces. */
async function bakeHere(who, bare, onProgress) {
  const it = bakeSteps(RECIPES[who](), { bare });
  let r = it.next();
  while (!r.done) { if (onProgress) onProgress(r.value); await pause(); r = it.next(); }
  return r.value;
}

/** Bake one figure on a thread of its own. Rejects if the thread cannot be started or comes to grief. */
function bakeAway(who, bare, onProgress) {
  return new Promise((resolve, reject) => {
    let worker, alive = false;
    const fail = (why) => { clearTimeout(timer); try { if (worker) worker.terminate(); } catch { /* it is gone already */ } reject(new Error(why)); };
    // (a thread that has not said it is ready within a few seconds is not going to)
    const timer = setTimeout(() => { if (!alive) fail('no answer from the baking thread'); }, 6000);
    try { worker = new BakeWorker(); } catch (err) { fail(String(err)); return; }
    worker.onerror = (e) => fail((e && e.message) || 'the baking thread failed');
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.ready) { alive = true; clearTimeout(timer); worker.postMessage({ who, bare }); return; }
      if (m.progress !== undefined) { if (onProgress) onProgress(m.progress); return; }
      if (m.error) { fail(m.error); return; }
      if (m.baked) { worker.terminate(); resolve(m.baked); }
    };
  });
}

/**
 * Start baking the figures named. Returns { name: a promise of the baked figure }, and `progress()` (0..1 over all of
 * them). `threads: false` keeps it all on this thread.
 */
export function startBaking(names, { bare = false, threads = true } = {}) {
  const done = Object.fromEntries(names.map((n) => [n, 0]));
  const began = performance.now();
  const out = { where: {}, took: {}, progress: () => names.reduce((a, n) => a + done[n], 0) / names.length };
  let chain = Promise.resolve();
  const here = (n) => {
    // (one at a time: they would only get in each other's way)
    const p = chain.then(() => bakeHere(n, bare, (v) => { done[n] = v; }));
    chain = p.catch(() => {});
    out.where[n] = 'here';
    return p;
  };
  for (const n of names) {
    out.where[n] = threads && typeof Worker !== 'undefined' ? 'thread' : 'here';
    out[n] = (out.where[n] === 'thread'
      ? bakeAway(n, bare, (v) => { done[n] = v; }).catch((err) => { console.warn(`baking ${n} on this thread instead (${err.message})`); return here(n); })
      : here(n)
    ).then((baked) => { done[n] = 1; out.took[n] = Math.round(performance.now() - began); return baked; });
  }
  return out;
}
