
const {
  app, BrowserWindow, WebContentsView, ipcMain, session, net, Menu, dialog, shell
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

const userDataPath = path.join(
  app.getPath('appData'),
  'mtkb'
);

const browserProfileResetMarkerPath = path.join(
  userDataPath,
  'browser-profile-reset.json'
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

function validateConfig(raw) {
  function requireObject(value, name) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new Error(`${name} must be an object.`);
    }
    return value;
  }

  function requireBoolean(value, name, fallback) {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') {
      throw new Error(`${name} must be true or false.`);
    }
    return value;
  }

  function warnUnknownKeys(object, allowed, name) {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) {
        console.warn(`Unknown configuration property: ${name}.${key}`);
      }
    }
  }

  const config = requireObject(raw, 'Configuration');

  warnUnknownKeys(config, [
    'configVersion',
    'startup',
    'certificateVerification',
    'browserData',
    'tabs',
    'startupTheme',
    'toolbar',
    'audio',
    'themes'
  ], 'config');

  if (
    config.configVersion !== undefined &&
    config.configVersion !== 1
  ) {
    throw new Error('configVersion must be 1.');
  }

  const startup = config.startup === undefined
    ? {}
    : requireObject(config.startup, 'startup');

  warnUnknownKeys(startup, ['mode'], 'startup');

  const startupMode = startup.mode === undefined ? 'windowed' : startup.mode;

  if (!['windowed', 'fullscreen', 'kiosk'].includes(startupMode)) {
    throw new Error(
      'startup.mode must be windowed, fullscreen, or kiosk.'
    );
  }

  const certificateVerification =
    config.certificateVerification === undefined
      ? {}
      : requireObject(
          config.certificateVerification,
          'certificateVerification'
        );

  warnUnknownKeys(
    certificateVerification,
    ['allowInvalidCertificatesFor'],
    'certificateVerification'
  );

  const certificateHosts =
    certificateVerification.allowInvalidCertificatesFor === undefined ? [] : certificateVerification.allowInvalidCertificatesFor;

  if (
    !Array.isArray(certificateHosts) ||
    certificateHosts.some(host =>
      typeof host !== 'string' ||
      host.trim() !== host ||
      host === '' ||
      host.includes('*') ||
      !/^[a-zA-Z0-9.-]+$/.test(host)
    )
  ) {
    throw new Error(
      'certificateVerification.allowInvalidCertificatesFor must be an array of hostnames or IP addresses. Wildcards and URLs are not permitted.'
    );
  }

  const browserData = config.browserData === undefined
    ? {}
    : requireObject(config.browserData, 'browserData');

  warnUnknownKeys(
    browserData,
    ['directory', 'clearCache', 'clearWebsiteData'],
    'browserData'
  );

  const directory = browserData.directory ?? null;

  if (
    directory !== null &&
    (
      typeof directory !== 'string' ||
      directory.trim() === ''
    )
  ) {
    throw new Error(
      'browserData.directory must be null or a non-empty path string.'
    );
  }

  function validateCleanup(value, name) {
    const cleanup = value === undefined
      ? {}
      : requireObject(value, name);

    warnUnknownKeys(cleanup, ['onStartup', 'onExit'], name);

    return {
      onStartup: requireBoolean(
        cleanup.onStartup,
        `${name}.onStartup`,
        false
      ),
      onExit: requireBoolean(
        cleanup.onExit,
        `${name}.onExit`,
        false
      )
    };
  }

  const toolbar = config.toolbar === undefined
    ? {}
    : requireObject(config.toolbar, 'toolbar');

  warnUnknownKeys(
    toolbar,
    ['showZoomControls', 'showThemeToggle', 'showMuteToggle'],
    'toolbar'
  );

  const normalizedToolbar = {
    showZoomControls: requireBoolean(
      toolbar.showZoomControls,
      'toolbar.showZoomControls',
      true
    ),
    showThemeToggle: requireBoolean(
      toolbar.showThemeToggle,
      'toolbar.showThemeToggle',
      true
    ),
    showMuteToggle: requireBoolean(
      toolbar.showMuteToggle,
      'toolbar.showMuteToggle',
      true
    )
  };

  const audio = config.audio === undefined
    ? {}
    : requireObject(config.audio, 'audio');

  warnUnknownKeys(audio, ['alwaysMuted'], 'audio');

  const alwaysMuted = requireBoolean(
    audio.alwaysMuted,
    'audio.alwaysMuted',
    false
  );

  if (!Array.isArray(config.tabs) || config.tabs.length === 0) {
    throw new Error('tabs must be a non-empty array.');
  }

  const tabIds = new Set();

  const tabs = config.tabs.map((rawTab, index) => {
    const tab = requireObject(rawTab, `tabs[${index}]`);

    warnUnknownKeys(
      tab,
      [
        'id',
        'name',
        'url',
        'localIcon',
        'iconPreference',
        'allowPopups',
        'allowWebsiteFullscreen'
      ],
      `tabs[${index}]`
    );

    if (
      typeof tab.id !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(tab.id)
    ) {
      throw new Error(
        `tabs[${index}].id must contain only letters, numbers, underscores, and hyphens.`
      );
    }

    if (tabIds.has(tab.id)) {
      throw new Error(`Duplicate tab ID: ${tab.id}`);
    }
    tabIds.add(tab.id);

    if (typeof tab.name !== 'string' || !tab.name.trim()) {
      throw new Error(`tabs[${index}].name must be a non-empty string.`);
    }

    if (typeof tab.url !== 'string') {
      throw new Error(`tabs[${index}].url must be a URL string.`);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(tab.url);
    } catch {
      throw new Error(`tabs[${index}].url is not a valid absolute URL.`);
    }

    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error(
        `tabs[${index}].url must use HTTP or HTTPS and cannot contain credentials.`
      );
    }

    if (
      tab.localIcon !== undefined &&
      (
        typeof tab.localIcon !== 'string' ||
        !tab.localIcon.trim()
      )
    ) {
      throw new Error(
        `tabs[${index}].localIcon must be a non-empty path string.`
      );
    }

    const iconPreference =
      tab.iconPreference === undefined ? 'website' : tab.iconPreference;
    if (!['local', 'website'].includes(iconPreference)) {
      throw new Error(
        `tabs[${index}].iconPreference must be local or website.`
      );
    }

    return {
      ...tab,
      iconPreference,
      allowPopups: requireBoolean(
        tab.allowPopups,
        `tabs[${index}].allowPopups`,
        false
      ),
      allowWebsiteFullscreen: requireBoolean(
        tab.allowWebsiteFullscreen,
        `tabs[${index}].allowWebsiteFullscreen`,
        true
      )
    };
  });

  const themes = requireObject(config.themes, 'themes');

  const themeProperties = [
    'toolbarBackground',
    'textColor',
    'navBackground',
    'navBorder',
    'navActiveBackground',
    'tabBackground',
    'tabTextColor',
    'selectedTabBackground',
    'selectedTabTextColor',
    'separatorColor'
  ];

  for (const [name, rawTheme] of Object.entries(themes)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(`Invalid theme name: ${name}`);
    }

    const theme = requireObject(rawTheme, `themes.${name}`);

    warnUnknownKeys(theme, themeProperties, `themes.${name}`);

    for (const property of themeProperties) {
      if (
        typeof theme[property] !== 'string' ||
        !/^#[0-9a-fA-F]{6}$/.test(theme[property])
      ) {
        throw new Error(
          `themes.${name}.${property} must be a six-digit hex colour (for example, #181818).`
        );
      }
    }
  }

  if (!themes.dark && !themes.light) {
    throw new Error('themes must define at least a dark or light theme.');
  }

  const startupTheme =
    config.startupTheme === undefined ? 'auto' : config.startupTheme;

  if (!['auto', 'light', 'dark'].includes(startupTheme)) {
    throw new Error('startupTheme must be auto, light, or dark.');
  }

  if (
    startupTheme !== 'auto' &&
    !themes[startupTheme]
  ) {
    throw new Error(
      `startupTheme is set to "${startupTheme}", but that theme is not defined in themes.`
    );
  }

  if (
    normalizedToolbar.showThemeToggle &&
    (!themes.dark || !themes.light)
  ) {
    throw new Error(
      'Both dark and light themes must be defined when toolbar.showThemeToggle is enabled.'
    );
  }

  return {
    ...config,
    configVersion: 1,
    startup: { mode: startupMode },
    certificateVerification: {
      allowInvalidCertificatesFor: [
        ...new Set(certificateHosts.map(host => host.toLowerCase()))
      ]
    },
    browserData: {
      directory,
      clearCache: validateCleanup(
        browserData.clearCache,
        'browserData.clearCache'
      ),
      clearWebsiteData: validateCleanup(
        browserData.clearWebsiteData,
        'browserData.clearWebsiteData'
      )
    },
    tabs,
    startupTheme,
    toolbar: normalizedToolbar,
    audio: { alwaysMuted },
    themes
  };
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

let certificateOverrideHosts = [];
let startupMode = 'windowed';
let startupTheme = 'auto';

let toolbarSettings = {
  showZoomControls: true,
  showThemeToggle: true,
  showMuteToggle: true
};

let alwaysMuted = false;

if (!showHelp && !startupError) {
  try {
    config = validateConfig(config);

    certificateOverrideHosts =
      config.certificateVerification.allowInvalidCertificatesFor;

    startupMode = cliStartupMode || config.startup.mode;
    startupTheme = config.startupTheme;
    toolbarSettings = config.toolbar;
    alwaysMuted = config.audio.alwaysMuted;
  } catch (error) {
    startupError = {
      title: 'Configuration Error',
      message: error.message
    };

    // Keep later initialization safe; the startup error prevents
    // the application from opening any browser tabs.
    config = {
      tabs: [],
      themes: {},
      startup: { mode: 'windowed' },
      startupTheme: 'auto',
      browserData: { directory: null },
      toolbar: {
        showZoomControls: true,
        showThemeToggle: true,
        showMuteToggle: true
      },
      audio: { alwaysMuted: false },
      certificateVerification: {
        allowInvalidCertificatesFor: []
      }
    };
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

function processPendingBrowserProfileReset(profilePath) {
  if (!fs.existsSync(browserProfileResetMarkerPath)) return;

  const resetRequest = JSON.parse(
    fs.readFileSync(browserProfileResetMarkerPath, 'utf8')
  );

  if (
    !resetRequest ||
    typeof resetRequest.profilePath !== 'string' ||
    path.resolve(resetRequest.profilePath) !== path.resolve(profilePath)
  ) {
    throw new Error(
      'The pending browser profile reset does not match the configured profile path. No files were deleted.'
    );
  }

  const resolvedUserDataPath = fs.realpathSync(userDataPath);

  let resolvedProfilePath = path.resolve(profilePath);

  if (fs.existsSync(resolvedProfilePath)) {
    resolvedProfilePath = fs.realpathSync(resolvedProfilePath);
  }

  const relativeUserDataPath = path.relative(
    resolvedProfilePath,
    resolvedUserDataPath
  );

  const profileContainsUserData =
    relativeUserDataPath === '' ||
    (
      relativeUserDataPath !== '..' &&
      !relativeUserDataPath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativeUserDataPath)
    );

  if (profileContainsUserData) {
    throw new Error(
      'The configured browser profile path contains the application data folder. Reset was refused to protect configuration and icons.'
    );
  }

  console.log(`Resetting browser profile: ${profilePath}`);

  fs.rmSync(profilePath, {
    recursive: true,
    force: true
  });

  fs.unlinkSync(browserProfileResetMarkerPath);

  console.log('Browser profile reset completed.');
}

let browserDataPath = null;

if (!startupError) {
  const browserDataDirectory = config.browserData?.directory ?? null;

  try {
    browserDataPath = resolveBrowserDataPath(browserDataDirectory);

    processPendingBrowserProfileReset(browserDataPath);

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
const zoomPath = path.join(userDataPath, 'zoom.json');

const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 5.0;

let win;
let activeTabId = config.tabs[0]?.id;
let globallyMuted = alwaysMuted;
const views = new Map();
const popupStacks = new Map();
let zoomLevels = new Map(
  config.tabs.map(tab => [tab.id, 1.0])
);
let allowExitCleanup = false;
let exitCleanupRunning = false;
let exitCleanupComplete = false;
let skipExitCleanup = false;

function readSavedTheme() {
  if (startupTheme !== 'auto') {
    return startupTheme;
  }

  try {
    const saved = JSON.parse(fs.readFileSync(themePath, 'utf8'));
    if (config.themes?.[saved.theme]) return saved.theme;
  } catch {}

  return config.themes?.dark ? 'dark' : 'light';
}

function readSavedZoomLevels() {
  const levels = new Map(
    config.tabs.map(tab => [tab.id, 1.0])
  );

  try {
    const saved = JSON.parse(fs.readFileSync(zoomPath, 'utf8'));

    if (
      !saved ||
      typeof saved !== 'object' ||
      Array.isArray(saved)
    ) {
      return levels;
    }

    for (const tab of config.tabs) {
      const factor = saved[tab.id];

      if (
        typeof factor === 'number' &&
        Number.isFinite(factor) &&
        factor >= MIN_ZOOM_FACTOR &&
        factor <= MAX_ZOOM_FACTOR
      ) {
        levels.set(tab.id, factor);
      }
    }
  } catch {}

  return levels;
}

function saveZoomLevels() {
  const saved = Object.fromEntries(
    config.tabs.map(tab => [
      tab.id,
      zoomLevels.get(tab.id) ?? 1.0
    ])
  );

  fs.mkdirSync(path.dirname(zoomPath), { recursive: true });
  fs.writeFileSync(zoomPath, JSON.stringify(saved, null, 2));
}

zoomLevels = readSavedZoomLevels();

function applyTabZoom(tabId) {
  const factor = zoomLevels.get(tabId) ?? 1.0;

  const view = views.get(tabId);
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.setZoomFactor(factor);
  }

  const stack = popupStacks.get(tabId) || [];
  for (const layer of stack) {
    if (!layer.popup.webContents.isDestroyed()) {
      layer.popup.webContents.setZoomFactor(factor);
    }
  }

  return factor;
}

function setTabZoom(tabId, factor) {
  if (
    typeof factor !== 'number' ||
    !Number.isFinite(factor) ||
    factor < MIN_ZOOM_FACTOR ||
    factor > MAX_ZOOM_FACTOR
  ) {
    throw new Error('Invalid zoom factor');
  }

  zoomLevels.set(tabId, factor);
  applyTabZoom(tabId);
  saveZoomLevels();

  return factor;
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
    toolbar: toolbarSettings,
    audio: {
      alwaysMuted
    },
    tabs: config.tabs.map(tab => ({
      ...tab,
      localIconDataUrl: getLocalIconDataUrl(tab.localIcon),
      iconPreference: tab.iconPreference === 'local' ? 'local' : 'website'
    }))
  };
}

function configureLocalCertificateTrust(ses) {
  if (certificateOverrideHosts.length === 0) return;

  ses.setCertificateVerifyProc((request, callback) => {
    if (certificateOverrideHosts.includes(request.hostname.toLowerCase())) {
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
  const factor = applyTabZoom(tabId);
  resizeViews();

  if (win && !win.isDestroyed()) {
    win.webContents.send('zoom-level-updated', factor);
  }

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

async function confirmBrowserProfileReset() {
  if (!win || win.isDestroyed() || !browserDataPath) return;

  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Reset Browser Profile',
    message: 'Are you sure you want to reset the browser profile?',
    detail:
      'This will permanently erase all browser sessions, website logins, cookies, cached data, saved website preferences, and local website storage for every tab.\n\nThe application will restart with a fresh browser profile. Your configuration, icons, and tab settings will be preserved.\n\nThis action cannot be undone.',
    buttons: ['Cancel', 'Reset Profile'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });

  if (result.response !== 1) return;

  let markerCreated = false;

  try {
    fs.writeFileSync(
      browserProfileResetMarkerPath,
      JSON.stringify({
        profilePath: path.resolve(browserDataPath),
        requestedAt: new Date().toISOString()
      }, null, 2),
      { flag: 'wx' }
    );

    markerCreated = true;

    skipExitCleanup = true;

    app.relaunch();
    app.quit();
  } catch (error) {
    skipExitCleanup = false;

    if (markerCreated) {
      try {
        fs.unlinkSync(browserProfileResetMarkerPath);
      } catch (cleanupError) {
        console.error(
          'Could not remove failed reset marker:',
          cleanupError
        );
      }
    }

    console.error('Browser profile reset failed:', error);

    if (win && !win.isDestroyed()) {
      await dialog.showMessageBox(win, {
        type: 'error',
        title: 'Reset Failed',
        message: 'Could not restart the application to reset the browser profile.',
        detail: error.message
      });
    }
  }
}

function openConfigurationFileLocation() {
  const isWsl =
    process.platform === 'linux' &&
    (
      Boolean(process.env.WSL_DISTRO_NAME) ||
      os.release().toLowerCase().includes('microsoft')
    );

  if (!isWsl) {
    shell.showItemInFolder(configPath);
    return;
  }

  execFile(
    'wslpath',
    ['-w', configPath],
    { encoding: 'utf8' },
    (error, stdout) => {
      if (error) {
        console.error('Could not convert configuration path for Windows:', error);
        return;
      }

      const windowsPath = stdout.trim();

      if (!windowsPath) {
        console.error('Windows configuration path is empty.');
        return;
      }

      const explorer = spawn(
        'explorer.exe',
        [`/select,${windowsPath}`],
        {
          detached: true,
          stdio: 'ignore'
        }
      );

      explorer.on('error', error => {
        console.error('Could not open Windows Explorer:', error);
      });

      explorer.unref();
    }
  );
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
        },
        {
          type: 'separator'
        },
        {
          label: 'Open Configuration File Location',
          click: () => openConfigurationFileLocation()
        },
        {
          label: 'Reset Browser Profile...',
          click: () => confirmBrowserProfileReset()
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
        win.setMenuBarVisibility(startupMode !== 'kiosk');
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

function installWebsiteFullscreenHandler(contents, tab) {
  contents.on('enter-html-full-screen', () => {
    if (tab.allowWebsiteFullscreen !== false || contents.isDestroyed()) {
      return;
    }

    contents.executeJavaScript('document.exitFullscreen()').catch(error => {
      console.warn(
        `Could not exit website fullscreen for tab "${tab.id}":`,
        error.message
      );
    });
  });
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

        installWebsiteFullscreenHandler(popup.webContents, tab);

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
        applyTabZoom(tab.id);

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

  // Zoom controls
  ipcMain.handle('get-zoom-level', () => {
    return zoomLevels.get(activeTabId) ?? 1.0;
  });

  ipcMain.handle('change-zoom', (_, direction) => {
    if (direction !== -1 && direction !== 1) {
      throw new Error('Invalid zoom direction');
    }

    const current = zoomLevels.get(activeTabId) ?? 1.0;

    const zoomSteps = [
      0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9,
      1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5,
      3.0, 4.0, 5.0
    ];

    const next = direction === 1
      ? zoomSteps.find(step => step > current + 0.001) ?? MAX_ZOOM_FACTOR
      : [...zoomSteps].reverse().find(step => step < current - 0.001) ?? MIN_ZOOM_FACTOR;

    const factor = setTabZoom(activeTabId, next);

    if (win && !win.isDestroyed()) {
      win.webContents.send('zoom-level-updated', factor);
    }

    return factor;
  });

  ipcMain.handle('reset-zoom', () => {
    const factor = setTabZoom(activeTabId, 1.0);

    if (win && !win.isDestroyed()) {
      win.webContents.send('zoom-level-updated', factor);
    }

    return factor;
  });

  // Audio controls
  ipcMain.handle('get-audio-muted', () => globallyMuted);
  ipcMain.handle('set-audio-muted', (_, muted) => {
    if (alwaysMuted) {
      return true;
    }

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

    installWebsiteFullscreenHandler(view.webContents, tab);

    // Handle popup requests for this tab and its nested popups.
    installPopupHandler(view.webContents, tab);

    views.set(tab.id, view);
    applyTabZoom(tab.id);
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
  if (
    !allowExitCleanup ||
    exitCleanupComplete ||
    skipExitCleanup
  ) return;

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
