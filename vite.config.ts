import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// GitHub Pages serves the site under /<repo-name>/ by default.
// If a custom domain (CNAME) is configured, set base to '/'.
const base = process.env.PAGES_BASE ?? '/ebioro-wallet-migration/';

export default defineConfig({
    base,
    plugins: [
        react(),
        nodePolyfills({
            include: ['buffer', 'process', 'util', 'stream'],
            globals: { Buffer: true, global: true, process: true },
        }),
    ],
});
