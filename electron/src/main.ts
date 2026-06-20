import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';

const WINDOW_WIDTH = 1200;
const WINDOW_HEIGHT = 820;
const LOOPBACK_HOST = '127.0.0.1';

interface BootstrapResult {
  readonly url: string;
  readonly port: number;
}

interface BootstrapOptions {
  port?: number;
  host?: string;
  frontendDist?: string;
}

type BootstrapApi = (
  options: BootstrapOptions,
) => Promise<BootstrapResult>;

let mainWindow: BrowserWindow | null = null;

/**
 * Resolves the on-disk locations of the compiled API and built frontend.
 * In development they sit next to this workspace; once packaged they live
 * under the app's resources directory (finalized in the packaging phase).
 */
function resolveResourcePaths(): { apiBootstrap: string; frontendDist: string } {
  const root = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', '..');
  return {
    apiBootstrap: path.join(root, 'api', 'dist', 'bootstrap.js'),
    frontendDist: path.join(root, 'frontend', 'dist'),
  };
}

/** Embeds and starts the NestJS server on an ephemeral loopback port. */
async function startEmbeddedApi(): Promise<string> {
  const { apiBootstrap, frontendDist } = resolveResourcePaths();

  // Keep the SQLite database in the per-user writable location so the app
  // works when installed (the relative default path is not writable then).
  if (process.env['DATABASE_PATH'] === undefined) {
    process.env['DATABASE_PATH'] = path.join(
      app.getPath('userData'),
      'jobsieve.sqlite',
    );
  }

  // The compiled API is CommonJS; require it from its built location.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const apiModule = require(apiBootstrap) as { bootstrapApi: BootstrapApi };
  const { url } = await apiModule.bootstrapApi({
    port: 0,
    host: LOOPBACK_HOST,
    frontendDist,
  });
  return url;
}

async function createWindow(url: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Open external links (job postings) in the system browser, not in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
}

function focusExistingWindow(): void {
  if (mainWindow === null) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// Single-instance lock: a second launch focuses the running window instead of
// booting a second server against the same (single-writer) SQLite file.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', focusExistingWindow);

  app
    .whenReady()
    .then(async () => {
      const url = await startEmbeddedApi();
      await createWindow(url);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow(url);
      });
    })
    .catch((err: unknown) => {
      console.error('Failed to start jobsieve desktop:', err);
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
