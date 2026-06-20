import { bootstrapApi } from './bootstrap.js';

// Standalone server entrypoint. Binds all interfaces on the configured port and
// serves the frontend from `cwd/frontend/dist`. The Electron desktop shell uses
// `bootstrapApi` directly with an ephemeral loopback port instead.
void bootstrapApi();
