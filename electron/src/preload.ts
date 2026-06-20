import { contextBridge } from 'electron';

// Minimal, safe bridge. Expanded in later phases (e.g. last-ingest status,
// settings round-trips) as the desktop shell grows.
contextBridge.exposeInMainWorld('jobsieve', {
  isDesktop: true,
  platform: process.platform,
});
