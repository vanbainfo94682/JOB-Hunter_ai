import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import fs from 'fs';
import path from 'path';

const currentVersion = Date.now().toString();

// Custom plugin to write version.json during build
function generateVersionPlugin() {
  return {
    name: 'generate-version-json',
    writeBundle() {
      const versionData = { version: currentVersion, buildTime: new Date().toISOString() };
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(versionData, null, 2));
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(currentVersion),
  },
  plugins: [react(), generateVersionPlugin()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/public': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            return 'vendor'; // all other deps
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});
