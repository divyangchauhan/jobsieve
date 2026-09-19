import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  root: local('.'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@clerk/nextjs', replacement: local('./clerk.tsx') },
      { find: 'next/navigation', replacement: local('./navigation.tsx') },
      { find: 'next/link', replacement: local('./link.tsx') },
      { find: '@/app/actions', replacement: local('./actions.ts') },
      { find: '@', replacement: root },
    ],
  },
  define: { 'process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY': '""' },
  server: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    fs: { allow: [root] },
  },
  css: { postcss: root },
});
