import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { builtinModules } from 'node:module';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const VITE_TARGET = process.env.VITE_TARGET || mode;

  const commonConfig: Partial<UserConfig> = {
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  };

  if (VITE_TARGET === 'server') {
    // Server-specific configuration.
    return {
      ...commonConfig,
      ssr: { 
        noExternal: true,
        resolve: {
          conditions: ['react-server']
        }
      },
      build: {
        ssr: 'src/server/index.ts',
        outDir: 'dist/server',
        target: 'es2022', 
        sourcemap: true,
        rollupOptions: {
          external: [...builtinModules],
          output: {
            format: 'cjs',
            entryFileNames: 'index.cjs',
            codeSplitting: false,
          },
        },
      },
    } as UserConfig;
  }

  // Client-specific configuration (default).
  return {
    ...commonConfig,
    root: 'src/client',
    base: './',
    plugins: [
      react(),
      tailwindcss(),],
    build: {
      rollupOptions: {
        input: {
          index: 'index.html',
          splash: 'splash.html'
        }
      },
      outDir: '../../dist/client',
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
    },
  } as UserConfig;
});