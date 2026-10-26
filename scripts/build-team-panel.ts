import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'production';
await build({
  configFile: false,
  mode: 'production',
  base: './',
  esbuild: { jsxDev: false },
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: fileURLToPath(new URL('../operational/team/', import.meta.url)),
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('../apps/web/src/embedded-team.tsx', import.meta.url)),
      name: 'AllianceTeamPanel', formats: ['iife'],
      fileName: () => 'team-panel.js', cssFileName: 'team-panel'
    }
  }
});
