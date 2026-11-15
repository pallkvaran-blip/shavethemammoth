import { defineConfig } from 'vite';

// `npm run build`          -> dist/           the game, self-contained (three.js bundled)
// `npm run build:artifact` -> dist-artifact/  one script with three.js left as an external
//                             import, which tools/make-artifact.mjs wraps into a single page
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      modulePreload: artifact ? false : undefined,
      rollupOptions: artifact
        // (what the page fetches when asked, a cast of one of the people, keeps its own name: those files are published beside the page)
        ? { external: [/^three($|\/)/], output: { entryFileNames: 'game.js', inlineDynamicImports: true, assetFileNames: 'assets/[name][extname]' } }
        : {},
    },
  };
});
