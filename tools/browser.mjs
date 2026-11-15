// The browser the live tests drive, and why it is the full one.
//
// Playwright can run two browsers without a window: a cut-down "headless shell" (its default) and the full browser.
// In the shell, a page that holds the pointer, as this game does while the elf walks, is sent pointer events without
// pause, thousands a second, though nothing moves. Without a graphics card a frame beside the mammoth takes a second
// or more, and what those events leave in the browser's own heap piles up faster than it is cleared: measured here at
// 7 to 16 MB a frame, against none at all in the full browser (with or without a window), and none in the shell
// either if the pointer is never held. A long test then ends with the browser killed for want of memory ("Target
// crashed"). The game's own memory is level throughout, and nobody plays in the shell, so the cure is here and not in
// the game: the tests use the full browser.
//
// HEADLESS_SHELL=1 goes back to the shell. So does a machine where the full browser is not installed, with a warning.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

// drawn by the processor where there is no graphics card
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function launch() {
  if (!process.env.HEADLESS_SHELL) {
    try { return await chromium.launch({ channel: 'chromium', args }); }
    catch (e) {
      console.log(`(the full browser would not start, so this run uses the headless shell, where a long test can run out of memory: ${String(e.message).split('\n')[0]})`);
    }
  }
  return chromium.launch({ args });
}
