
const {
  app, BrowserWindow, WebContentsView, ipcMain, session, net
} = require('electron');
const path = require('path');
const fs = require('fs');

const userDataPath = path.join(
  app.getPath('appData'),
  'kiosk-browser'
);

fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')
);

const themePath = path.join(app.getPath('userData'), 'theme.json');

let win;
let activeTabId = config.tabs[0]?.id;
let globallyMuted = false;
const views = new Map();

function readSavedTheme() {
  try {
    const saved = JSON.parse(fs.readFileSync(themePath, 'utf8'));
    if (config.themes?.[saved.theme]) return saved.theme;
  } catch {}

  return config.defaultTheme || 'dark';
}

function getLocalIconDataUrl(relativePath) {
  if (!relativePath) return null;

  try {
    const fullPath = path.resolve(__dirname, relativePath);
    const ext = path.extname(fullPath).toLowerCase();

    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp'
    };

    const mime = mimeTypes[ext];
    if (!mime) return null;

    const data = fs.readFileSync(fullPath);
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch (error) {
    return null;
  }
}

function getConfigForToolbar() {
  return {
    ...config,
    tabs: config.tabs.map(tab => ({
      ...tab,
      localIconDataUrl: getLocalIconDataUrl(tab.localIcon),
      iconPreference: tab.iconPreference === 'local' ? 'local' : 'website'
    }))
  };
}

function configureLocalCertificateTrust(ses) {
  ses.setCertificateVerifyProc((request, callback) => {
    if (request.hostname === '192.168.0.151') {
      callback(0);
    } else {
      callback(-3);
    }
  });
}

function getActiveContents() {
  const view = views.get(activeTabId);
  return view ? view.webContents : null;
}

function resizeViews() {
  if (!win || win.isDestroyed()) return;

  const { width, height } = win.getContentBounds();
  const bounds = {
    x: 0,
    y: 40,
    width,
    height: Math.max(0, height - 40)
  };

  for (const [id, view] of views) {
    view.setBounds(bounds);
    view.setVisible(id === activeTabId);
  }
}

function activateTab(tabId) {
  if (!views.has(tabId)) return false;

  activeTabId = tabId;
  resizeViews();
  return true;
}

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');

  win.on('resize', resizeViews);
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  ipcMain.handle('get-config', () => getConfigForToolbar());

  // Audio controls
  ipcMain.handle('get-audio-muted', () => globallyMuted);

  ipcMain.handle('set-audio-muted', (_, muted) => {
    globallyMuted = Boolean(muted);

    for (const view of views.values()) {
      view.webContents.setAudioMuted(globallyMuted);
    }

    return globallyMuted;
  });

  ipcMain.handle('get-audio-states', () => {
    return Object.fromEntries(
      [...views.entries()].map(([id, view]) => [
        id,
        view.webContents.isCurrentlyAudible()
      ])
    );
  });

  ipcMain.handle('activate-tab', (_, id) => activateTab(id));

  ipcMain.handle('go-back', () => {
    const contents = getActiveContents();
    if (contents?.canGoBack()) contents.goBack();
  });

  ipcMain.handle('go-forward', () => {
    const contents = getActiveContents();
    if (contents?.canGoForward()) contents.goForward();
  });

  ipcMain.handle('refresh-tab', () => {
    getActiveContents()?.reload();
  });

  ipcMain.handle('go-home', () => {
    const tab = config.tabs.find(t => t.id === activeTabId);
    if (tab) getActiveContents()?.loadURL(tab.url);
  });

  ipcMain.handle('get-theme', () => readSavedTheme());

  ipcMain.handle('set-theme', (_, theme) => {
    if (!Object.prototype.hasOwnProperty.call(config.themes || {}, theme)) {
      throw new Error('Invalid theme');
    }

    fs.mkdirSync(path.dirname(themePath), { recursive: true });
    fs.writeFileSync(themePath, JSON.stringify({ theme }, null, 2));
    return theme;
  });

  ipcMain.handle('fetch-favicon-data', async (_event, url) => {
    try {
      // Only permit HTTPS favicon URLs.
      if (typeof url !== 'string' || !url.startsWith('https://')) {
        return null;
      }

      const response = await net.fetch(url);

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type') || '';

      if (!contentType.startsWith('image/')) {
        return null;
      }

      const data = Buffer.from(await response.arrayBuffer()).toString('base64');
      return `data:${contentType};base64,${data}`;
    } catch (error) {
      return null;
    }
  });

  createWindow();

  for (const tab of config.tabs) {
    const ses = session.fromPartition(`persist:kiosk-${tab.id}`);
    configureLocalCertificateTrust(ses);

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    views.set(tab.id, view);
    win.contentView.addChildView(view);
    view.setVisible(false);

    // Apply global mute to this tab, including pages loaded later.
    view.webContents.setAudioMuted(globallyMuted);

    // Report changes in actual audible playback to the toolbar.
    view.webContents.on('audio-state-changed', (_event, audible) => {
      if (!win || win.isDestroyed()) return;

      win.webContents.send('audio-state-updated', {
        id: tab.id,
        audible: typeof audible === 'boolean'
          ? audible
          : view.webContents.isCurrentlyAudible()
      });
    });

    view.webContents.on('page-favicon-updated', (_event, favicons) => {
      if (!win || win.isDestroyed()) return;

      win.webContents.send('favicon-updated', {
        id: tab.id,
        urls: favicons
      });
    });

    view.webContents.loadURL(tab.url);
  }

  activateTab(activeTabId);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
