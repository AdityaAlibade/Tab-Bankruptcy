import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Custom Vite plugin to copy manifest.json and icons to dist directory
function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Copy manifest.json
      const manifestSrc = resolve(__dirname, 'manifest.json');
      const manifestDist = resolve(distDir, 'manifest.json');
      if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, manifestDist);
      }

      // Copy icons folder
      const iconsSrc = resolve(__dirname, 'icons');
      const iconsDist = resolve(distDir, 'icons');
      if (fs.existsSync(iconsSrc)) {
        if (!fs.existsSync(iconsDist)) {
          fs.mkdirSync(iconsDist, { recursive: true });
        }
        for (const file of fs.readdirSync(iconsSrc)) {
          fs.copyFileSync(resolve(iconsSrc, file), resolve(iconsDist, file));
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [copyExtensionAssets()],
});
