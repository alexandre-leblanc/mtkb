
const {
  app, BrowserWindow, WebContentsView, ipcMain, session, net, Menu, dialog
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const userDataPath = path.join(
  app.getPath('appData'),
  'mtkb'
);

const usage = `Multi-Tab Kiosk Browser

Usage: mtkb [options]

Options:
  --config <path>   Use a specific configuration file.
  --windowed        Start in a normal resizable window.
  --fullscreen      Start in fullscreen mode.
  --kiosk           Start in kiosk mode.
  --help            Show this help message.

Display mode options are mutually exclusive.
A command-line display mode overrides startup.mode in the configuration.
Without either setting, the application starts windowed.
`;

const appArguments = process.argv.slice(2);

const showHelp = appArguments.includes('--help');

let configPath = path.join(userDataPath, 'config.json');
let configPathError = null;
let cliStartupMode = null;
let configOptionCount = 0;

if (!showHelp) {
  for (let i = 0; i < appArguments.length; i++) {
    const arg = appArguments[i];

    if (arg === '--windowed' || arg === '--fullscreen' || arg === '--kiosk') {
      if (cliStartupMode !== null) {
        configPathError =
          'Only one of --windowed, --fullscreen, or --kiosk may be specified.';
        break;
      }

      cliStartupMode = arg.slice(2);
      continue;
    }

    if (arg === '--config') {
      configOptionCount++;

      if (configOptionCount > 1) {
        configPathError = 'The --config option can only be specified once.';
        break;
      }

      const suppliedPath = appArguments[++i];

      if (!suppliedPath || suppliedPath.startsWith('--')) {
        configPathError = 'The --config option requires a file path.';
        break;
      }

      configPath = path.resolve(process.cwd(), suppliedPath);
      continue;
    }

    if (arg.startsWith('--config=')) {
      configOptionCount++;

      if (configOptionCount > 1) {
        configPathError = 'The --config option can only be specified once.';
        break;
      }

      const suppliedPath = arg.slice('--config='.length);

      if (!suppliedPath.trim()) {
        configPathError = 'The --config option requires a file path.';
        break;
      }

      configPath = path.resolve(process.cwd(), suppliedPath);
      continue;
    }

    if (arg.startsWith('-')) {
      configPathError = `Unknown option: ${arg}`;
      break;
    }

    configPathError = `Unexpected argument: ${arg}`;
    break;
  }
}

const usingDefaultConfig = configOptionCount === 0;

if (!showHelp) {
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
}

let config;
let startupError = null;

try {
  if (showHelp) {
    config = {
      tabs: [],
      themes: {},
      defaultTheme: 'dark'
    };
  } else {
    if (configPathError) {
      throw new Error(configPathError);
    }

    // Initialize the default configuration on first launch.
    if (usingDefaultConfig && !fs.existsSync(configPath)) {
      const exampleConfigPath = path.join(
        __dirname,
        'config.example.json'
      );

      const bundledIconsPath = path.join(__dirname, 'icons');
      const userIconsPath = path.join(userDataPath, 'icons');

      if (!fs.existsSync(exampleConfigPath)) {
        throw new Error(
          `The bundled example configuration was not found: ${exampleConfigPath}`
        );
      }

      // Copy bundled icons only if the user does not already have an icons folder.
      if (
        fs.existsSync(bundledIconsPath) &&
        !fs.existsSync(userIconsPath)
      ) {
        fs.cpSync(bundledIconsPath, userIconsPath, {
          recursive: true,
          errorOnExist: true,
          force: false
        });
      }

      fs.copyFileSync(
        exampleConfigPath,
        configPath,
        fs.constants.COPYFILE_EXCL
      );
    }

    config = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    );
  }
} catch (error) {
  const reason = configPathError
    ? 'Invalid command-line option.'
    : error instanceof SyntaxError
      ? 'The configuration file contains invalid JSON.'
      : 'The configuration file could not be read.';

  const details = configPathError || error.message;

  startupError = {
    title: 'Startup Error',
    message: configPathError
      ? `${reason}\n\n${details}\n\n${usage}`
      : `${reason}\n\nFile: ${configPath}\n\n${details}`
  };

  config = {
    tabs: [],
    themes: {},
    defaultTheme: 'dark'
  };
}

let startupMode = 'windowed';

if (!showHelp && !startupError) {
  const configuredMode = config.startup?.mode ?? 'windowed';
  const validModes = ['windowed', 'fullscreen', 'kiosk'];

  if (!validModes.includes(configuredMode)) {
    startupError = {
      title: 'Configuration Error',
      message:
        `Invalid startup.mode: ${configuredMode}\n\n` +
        'Valid values are: windowed, fullscreen, kiosk.'
    };
  } else {
    startupMode = cliStartupMode || configuredMode;
  }
}

function resolveBrowserDataPath(directory) {
  if (directory === null || directory === undefined) {
    return path.join(userDataPath, 'browser-data');
  }

  if (typeof directory !== 'string' || directory.trim() === '') {
    throw new Error(
      'browserData.directory must be null or a non-empty path string.'
    );
  }

  let expandedPath = directory.trim();
  const homePath = os.homedir();

  // Expand ~ on all supported platforms.
  if (
    expandedPath === '~' ||
    expandedPath.startsWith('~/') ||
    expandedPath.startsWith('~\\')
  ) {
    expandedPath = path.join(homePath, expandedPath.slice(2));
  }

  // Expand platform-specific home-directory variables.
  if (process.platform === 'win32') {
    expandedPath = expandedPath.replace(
      /%USERPROFILE%/gi,
      process.env.USERPROFILE || homePath
    );
  } else {
    expandedPath = expandedPath
      .replace(/\$\{HOME\}/g, homePath)
      .replace(/\$HOME(?=$|[\\/])/g, homePath);
  }

  // Resolve relative paths from the active config file's directory.
  const basePath = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(__dirname, expandedPath);

  // Keep the browser profile in its own application-specific folder.
  return path.join(basePath, 'mtkb');
}

let browserDataPath = null;

if (!startupError) {
  const browserDataDirectory = config.browserData?.directory ?? null;

  try {
    browserDataPath = resolveBrowserDataPath(browserDataDirectory);

    fs.mkdirSync(browserDataPath, { recursive: true });

    fs.accessSync(
      browserDataPath,
      fs.constants.R_OK | fs.constants.W_OK
    );

    console.log(`Using browser profile: ${browserDataPath}`);

    app.setPath('sessionData', browserDataPath);
  } catch (error) {
    const configuredPath = browserDataDirectory ?? '(default)';

    const resolvedPath = browserDataPath
      ? `\nResolved profile path: ${browserDataPath}`
      : '';

    startupError = {
      title: 'Browser Profile Error',
      message: `The browser profile directory could not be created or accessed.\n\nConfigured browserData.directory: ${configuredPath}${resolvedPath}\n\n${error.message}`
    };
  }
}

const themePath = path.join(app.getPath('userData'), 'theme.json');

let win;
let activeTabId = config.tabs[0]?.id;
let globallyMuted = false;
const views = new Map();
const popupStacks = new Map();
let allowExitCleanup = false;
let exitCleanupRunning = false;
let exitCleanupComplete = false;

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
    const fullPath = path.resolve(path.dirname(configPath), relativePath);
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
  const stack = popupStacks.get(activeTabId);

  if (stack?.length) {
    const topPopup = stack[stack.length - 1].popup;

    if (!topPopup.webContents.isDestroyed()) {
      return topPopup.webContents;
    }
  }

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

  const tabAreaHeight = Math.max(0, height - 40);

  for (const [id, stack] of popupStacks) {
    stack.forEach((layer, index) => {
      const inset = 32 * (index + 1);

      const popupWidth = Math.max(0, width - inset * 2);
      const popupHeight = Math.max(0, tabAreaHeight - inset * 2);

      const popupBounds = {
        x: Math.round((width - popupWidth) / 2),
        y: Math.round(40 + (tabAreaHeight - popupHeight) / 2),
        width: popupWidth,
        height: popupHeight
      };

      layer.overlay.setBounds(bounds);
      layer.overlay.setVisible(id === activeTabId);

      layer.popup.setBounds({
        x: popupBounds.x + 2,
        y: popupBounds.y + 2,
        width: Math.max(0, popupBounds.width - 4),
        height: Math.max(0, popupBounds.height - 4)
      });
      layer.popup.setVisible(id === activeTabId);

      layer.closeView.setBounds({
        x: popupBounds.x + popupBounds.width - 40,
        y: popupBounds.y + 8,
        width: 32,
        height: 32
      });
      layer.closeView.setVisible(id === activeTabId);
    });
  }
}

function activateTab(tabId) {
  if (!views.has(tabId)) return false;

  activeTabId = tabId;
  resizeViews();
  return true;
}

let resizeTimer = null;

function scheduleResizeViews() {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }

  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    resizeViews();
  }, 100);
}

function confirmKioskExit() {
  if (!win || win.isDestroyed()) return;

  dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Exit Kiosk Mode',
    message: 'Are you sure you want to exit the kiosk application?',
    buttons: ['Cancel', 'Exit'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }).then(({ response }) => {
    if (response === 1) {
      app.quit();
    }
  }).catch(error => {
    console.error('Kiosk exit confirmation failed:', error);
  });
}

function handleApplicationShortcut(contents) {
  contents.on('before-input-event', (event, input) => {
    // Kiosk exit shortcut: Ctrl+Shift+Q.
    if (
      startupMode === 'kiosk' &&
      input.key.toLowerCase() === 'q' &&
      input.control &&
      input.shift &&
      !input.alt &&
      !input.meta
    ) {
      event.preventDefault();

      if (
        input.type === 'keyDown' &&
        !input.isAutoRepeat
      ) {
        confirmKioskExit();
      }

      return;
    }

    if (input.key === 'F5') {
      event.preventDefault();

      if (
        input.type !== 'keyDown' ||
        input.isAutoRepeat ||
        contents.isDestroyed()
      ) {
        return;
      }

      if (win && contents === win.webContents) {
        getActiveContents()?.reload();
      } else {
        contents.reload();
      }

      return;
    }

    if (input.key !== 'F11') return;

    event.preventDefault();

    // F11 cannot take the application out of kiosk mode.
    if (startupMode === 'kiosk') return;

    if (
      input.type !== 'keyDown' ||
      input.isAutoRepeat ||
      !win ||
      win.isDestroyed()
    ) {
      return;
    }

    win.setFullScreen(!win.isFullScreen());
  });
}

function getPersistentTabSessions(scope) {
  if (scope === 'current') {
    const view = views.get(activeTabId);
    return view ? [view.webContents.session] : [];
  }

  const partitionNames = new Set(
    config.tabs.map(tab => `kiosk-${tab.id}`)
  );

  const partitionsPath = path.join(
    app.getPath('sessionData'),
    'Partitions'
  );

  if (fs.existsSync(partitionsPath)) {
    for (const entry of fs.readdirSync(partitionsPath, {
      withFileTypes: true
    })) {
      if (
        entry.isDirectory() &&
        /^kiosk-[a-zA-Z0-9_-]+$/.test(entry.name)
      ) {
        partitionNames.add(entry.name);
      }
    }
  }

  return [...partitionNames].map(name =>
    session.fromPartition(`persist:${name}`)
  );
}

async function clearTabCache(scope) {
  const sessions = getPersistentTabSessions(scope);

  await Promise.all(
    sessions.map(ses => ses.clearCache())
  );

  console.log(`Cache cleared: ${scope} (${sessions.length} sessions)`);
}

async function clearTabWebsiteData(scope) {
  const sessions = getPersistentTabSessions(scope);

  await Promise.all(
    sessions.map(async ses => {
      await ses.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'serviceworkers',
          'cachestorage'
        ]
      });

      await ses.clearAuthCache();
    })
  );

  console.log(
    `Cookies and website data cleared: ${scope} (${sessions.length} sessions)`
  );
}

async function clearConfiguredBrowserData(stage) {
  const clearCache =
    config.browserData?.clearCache?.[stage] === true;

  const clearWebsiteData =
    config.browserData?.clearWebsiteData?.[stage] === true;

  if (!clearCache && !clearWebsiteData) return;

  console.log(`Running browser data cleanup: ${stage}`);

  if (clearCache) {
    await clearTabCache('all');
  }

  if (clearWebsiteData) {
    await clearTabWebsiteData('all');
  }

  console.log(`Browser data cleanup completed: ${stage}`);
}

async function confirmWebsiteDataClear(scope) {
  if (!win || win.isDestroyed()) return;

  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Clear Cookies and Website Data',
    message: scope === 'current'
      ? 'Clear cookies and website data for the current tab?'
      : 'Clear cookies and website data for ALL tabs?',
    detail:
      'This can sign you out of websites and erase saved website preferences and local data. This action cannot be undone.',
    buttons: ['Cancel', 'Clear Data'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });

  if (result.response !== 1) return;

  try {
    await clearTabWebsiteData(scope);
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Maintenance Complete',
      message: 'Cookies and website data have been cleared.'
    });
  } catch (error) {
    console.error('Website data clearing failed:', error);
    await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Maintenance Failed',
      message: 'Could not clear all website data.',
      detail: error.message
    });
  }
}

function createApplicationMenu() {
  if (startupMode === 'kiosk') {
    Menu.setApplicationMenu(null);
    return;
  }

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Full Screen',
          accelerator: 'F11',
          click: () => {
            if (win && !win.isDestroyed()) {
              win.setFullScreen(!win.isFullScreen());
            }
          }
        }
      ]
    },
    {
      label: 'Maintenance',
      submenu: [
        {
          label: 'Clear Cache',
          submenu: [
            {
              label: 'Current Tab',
              click: () => {
                clearTabCache('current').catch(error =>
                  console.error('Cache clearing failed:', error)
                );
              }
            },
            {
              label: 'All Tabs',
              click: () => {
                clearTabCache('all').catch(error =>
                  console.error('Cache clearing failed:', error)
                );
              }
            }
          ]
        },
        {
          label: 'Clear Cookies and Website Data',
          submenu: [
            {
              label: 'Current Tab',
              click: () => confirmWebsiteDataClear('current')
            },
            {
              label: 'All Tabs',
              click: () => confirmWebsiteDataClear('all')
            }
          ]
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    center: true,
    fullscreen: startupMode === 'fullscreen',
    kiosk: startupMode === 'kiosk',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');

  win.setMenuBarVisibility(startupMode === 'windowed');

  win.on('resize', scheduleResizeViews);

  win.on('maximize', scheduleResizeViews);
  win.on('unmaximize', scheduleResizeViews);

  win.on('enter-full-screen', () => {
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.setMenuBarVisibility(false);
      }
    }, 100);

    scheduleResizeViews();
  });

  win.on('leave-full-screen', () => {
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.setMenuBarVisibility(startupMode === 'windowed');
      }
    }, 100);

    scheduleResizeViews();
  });

  handleApplicationShortcut(win.webContents);

  win.on('closed', () => {
    win = null;
  });
}

function isAllowedPopupUrl(url) {
  try {
    const targetUrl = new URL(url);

    return (
      ['http:', 'https:'].includes(targetUrl.protocol) ||
      targetUrl.href === 'about:blank'
    );
  } catch {
    return false;
  }
}

function installPopupHandler(contents, tab) {
  contents.setWindowOpenHandler((details) => {
    // Ignore popup requests caused by middle-clicking a link.
    if (details.disposition === 'background-tab') {
      return { action: 'deny' };
    }

    if (tab.allowPopups !== true) {
      return { action: 'deny' };
    }

    if (!isAllowedPopupUrl(details.url)) {
      return { action: 'deny' };
    }

    return {
      action: 'allow',

      createWindow: (options) => {
        if (!win || win.isDestroyed()) {
          return null;
        }

        // Adopt Electron's popup contents to preserve its opener and session.
        const popup = new WebContentsView({
          webContents: options.webContents
        });
        handleApplicationShortcut(popup.webContents);

        popup.setBorderRadius(4);
        popup.webContents.setAudioMuted(globallyMuted);

        const overlay = new WebContentsView({
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        });

        overlay.setBackgroundColor('#00000000');

        const closeView = new WebContentsView({
          webPreferences: {
            preload: path.join(__dirname, 'popup-close-preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        });

        const stack = popupStacks.get(tab.id) || [];
        const layer = { popup, overlay, closeView };

        stack.push(layer);
        popupStacks.set(tab.id, stack);

        // Add in this order so each new layer sits above the previous one.
        win.contentView.addChildView(overlay);
        win.contentView.addChildView(popup);
        win.contentView.addChildView(closeView);

        overlay.webContents.loadFile(
          path.join(__dirname, 'popup-overlay.html'),
          { query: { inset: String(32 * stack.length) } }
        );

        closeView.webContents.loadFile(
          path.join(__dirname, 'popup-close.html')
        );

        resizeViews();

        // Allow this popup to create further embedded popups.
        installPopupHandler(popup.webContents, tab);

        popup.webContents.on('before-input-event', (event, input) => {
          if (input.type === 'keyDown' && input.key === 'Escape') {
            event.preventDefault();
            popup.webContents.close();
          }
        });

        popup.webContents.on('destroyed', () => {
          const currentStack = popupStacks.get(tab.id) || [];
          const layerIndex = currentStack.indexOf(layer);

          if (layerIndex !== -1) {
            // Closing a parent also closes any nested popups above it.
            const removedLayers = currentStack.splice(layerIndex);

            for (const removedLayer of removedLayers) {
              if (win && !win.isDestroyed()) {
                try {
                  win.contentView.removeChildView(removedLayer.closeView);
                  win.contentView.removeChildView(removedLayer.popup);
                  win.contentView.removeChildView(removedLayer.overlay);
                } catch (error) {
                  console.warn('Popup view cleanup skipped:', error.message);
                }
              }

              for (const auxiliaryView of [
                removedLayer.closeView,
                removedLayer.overlay
              ]) {
                const auxiliaryContents = auxiliaryView.webContents;

                if (
                  auxiliaryContents &&
                  !auxiliaryContents.isDestroyed()
                ) {
                  auxiliaryContents.close();
                }
              }

              if (
                removedLayer !== layer &&
                !removedLayer.popup.webContents.isDestroyed()
              ) {
                removedLayer.popup.webContents.close();
              }
            }
          }

          if (currentStack.length === 0) {
            popupStacks.delete(tab.id);
          }

          resizeViews();
        });

        return popup.webContents;
      }
    };
  });
}

app.whenReady().then(async () => {
  if (showHelp) {
    console.log(usage);
    app.quit();
    return;
  }

  if (startupError) {
    dialog.showErrorBox(
      startupError.title,
      startupError.message
    );

    app.quit();
    return;
  }

  try {
    await clearConfiguredBrowserData('onStartup');
  } catch (error) {
    console.error('Startup browser data cleanup failed:', error);

    dialog.showErrorBox(
      'Startup Cleanup Failed',
      `Could not complete the configured browser data cleanup.\n\n${error.message}\n\nThe application will not load any websites.`
    );

    app.quit();
    return;
  }

  allowExitCleanup = true;

  ipcMain.handle('get-config', () => getConfigForToolbar());

  ipcMain.on('close-active-popup', () => {
    const stack = popupStacks.get(activeTabId);
    const topLayer = stack?.[stack.length - 1];

    if (
      topLayer &&
      !topLayer.popup.webContents.isDestroyed()
    ) {
      topLayer.popup.webContents.close();
    }
  });

  // Audio controls
  ipcMain.handle('get-audio-muted', () => globallyMuted);

  ipcMain.handle('set-audio-muted', (_, muted) => {
    globallyMuted = Boolean(muted);

    for (const view of views.values()) {
      view.webContents.setAudioMuted(globallyMuted);
    }

    for (const stack of popupStacks.values()) {
      for (const layer of stack) {
        layer.popup.webContents.setAudioMuted(globallyMuted);
      }
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
    const contents = getActiveContents();
    contents?.reload();
  });

  ipcMain.handle('go-home', () => {
    const tab = config.tabs.find(t => t.id === activeTabId);
    const stack = popupStacks.get(activeTabId);

    if (stack?.length) {
      stack[0].popup.webContents.close();
    }

    const view = views.get(activeTabId);

    if (tab && view && !view.webContents.isDestroyed()) {
      view.webContents.loadURL(tab.url);
    }
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

  createApplicationMenu();
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
    handleApplicationShortcut(view.webContents);

    // Handle popup requests for this tab and its nested popups.
    installPopupHandler(view.webContents, tab);

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

app.on('before-quit', event => {
  if (!allowExitCleanup || exitCleanupComplete) return;

  const clearCache =
    config.browserData?.clearCache?.onExit === true;

  const clearWebsiteData =
    config.browserData?.clearWebsiteData?.onExit === true;

  if (!clearCache && !clearWebsiteData) {
    exitCleanupComplete = true;
    return;
  }

  event.preventDefault();

  if (exitCleanupRunning) return;

  exitCleanupRunning = true;

  clearConfiguredBrowserData('onExit')
    .catch(error => {
      console.error('Exit browser data cleanup failed:', error);
    })
    .finally(() => {
      exitCleanupComplete = true;
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
