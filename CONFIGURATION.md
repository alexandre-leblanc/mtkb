# Configuration Guide

Multi-Tab Kiosk Browser is configured through a JSON file named `config.json`.

The configuration controls the startup display mode, browser profile location, website tabs, icons, themes, certificate verification exceptions, and automatic browser-data cleanup.

A sample configuration is provided in [`config.example.json`](config.example.json).

## 1. Configuration file location

By default, the application stores its configuration in its application data directory.

| Operating system | Default configuration path |
|---|---|
| Windows | `%APPDATA%\mtkb\config.json` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/mtkb/config.json` |
| macOS | `~/Library/Application Support/mtkb/config.json` |

### Windows

`%APPDATA%` is normally:

```text
C:\Users\<username>\AppData\Roaming
```

### Using a custom configuration file

A different configuration file can be specified with the `--config` command-line option:

```bash
mtkb --config /path/to/config.json
```

The path can be absolute or relative. Relative paths are resolved from the application's current working directory.

When a custom configuration file is used, local icon paths and relative browser-profile paths are resolved relative to that configuration file's directory.

## 2. Configuration overview

The following is a simplified example showing the main configuration sections:

```json
{
  "configVersion": 1,

  "startup": {
    "mode": "windowed"
  },

  "startupTheme": "auto",

  "toolbar": {
    "showZoomControls": true,
    "showThemeToggle": true,
    "showMuteToggle": true
  },

  "audio": {
    "alwaysMuted": false
  },

  "certificateVerification": {
    "allowInvalidCertificatesFor": []
  },

  "browserData": {
    "directory": null,
    "clearCache": {
      "onStartup": false,
      "onExit": false
    },
    "clearWebsiteData": {
      "onStartup": false,
      "onExit": false
    }
  },

  "tabs": [],

  "themes": {}
}
```

The sections below describe each setting.

## 3. Startup display mode

The `startup` object controls how the application window opens.

| Setting | Accepted values | Default |
|---|---|---|
| `startup.mode` | `windowed`, `fullscreen`, `kiosk` | `windowed` |

Example:

```json
"startup": {
  "mode": "kiosk"
}
```

### Display modes

- **windowed** — Opens in a normal, resizable application window with the menu bar visible.
- **fullscreen** — Opens in fullscreen mode. The menu bar is hidden while fullscreen.
- **kiosk** — Opens in Electron kiosk mode, hides the application menu, and prevents F11 from leaving kiosk mode.

Kiosk mode includes a keyboard shortcut for requesting an exit confirmation:

`Ctrl + Shift + Q`

### Command-line overrides

The startup display mode can also be overridden from the command line:

```bash
mtkb --windowed
mtkb --fullscreen
mtkb --kiosk
```

A command-line display mode takes precedence over `startup.mode`.

Only one display-mode option may be supplied at a time.

See the `--help` option for command-line usage.

## 4. Startup theme

The top-level `startupTheme` setting controls the theme selected when the application starts.

| Value | Behaviour |
|---|---|
| `auto` | Restores the last theme selected in the application. |
| `light` | Always starts using the light theme. |
| `dark` | Always starts using the dark theme. |

Default:

```json
"startupTheme": "auto"
```

Examples:

```json
"startupTheme": "light"
```

```json
"startupTheme": "dark"
```

### Theme persistence

The application's theme selection is saved separately from `config.json` in the application's user-data directory.

When `startupTheme` is set to `auto`, the application restores that saved preference. If no valid saved preference exists, it falls back to dark when a dark theme is defined; otherwise, it uses light.

When `startupTheme` is set to `light` or `dark`, that theme is selected at startup regardless of the previously saved preference.

The theme toggle remains available during the session. Changing the theme immediately updates the interface and saves the new selection.

A forced startup theme does not prevent the user from switching themes during a session.

## 5. Toolbar and audio settings

The `toolbar` and `audio` objects control the visibility and behaviour of the application toolbar and audio playback.

### Toolbar visibility

The following settings determine which controls are displayed:

| Setting | Default | Behaviour |
|---|---|---|
| `toolbar.showZoomControls` | `true` | Shows or hides the zoom-in and zoom-out controls. Zoom levels range from 25% to 500%, are saved separately for each tab, and restored when the application restarts. |
| `toolbar.showThemeToggle` | `true` | Shows or hides the light/dark theme toggle. |
| `toolbar.showMuteToggle` | `true` | Shows or hides the global audio mute toggle. |

Example:

```json
"toolbar": {
  "showZoomControls": false,
  "showThemeToggle": true,
  "showMuteToggle": false
}
```

Each setting can be independently enabled or disabled.

### Audio behaviour

The `audio.alwaysMuted` setting controls whether audio is allowed to play in any tab.

| Setting | Default | Behaviour |
|---|---|---|
| `audio.alwaysMuted` | `false` | When `true`, all tabs and popups are forced to remain muted. |

Example:

```json
"audio": {
  "alwaysMuted": true
}
```

When `alwaysMuted` is enabled:

- All existing tabs are muted.
- Newly opened tabs and popups are also muted.
- The mute toggle is disabled, preventing audio from being enabled.
- The mute toggle remains visible unless `toolbar.showMuteToggle` is set to `false`.

### Validation

All settings in the `toolbar` and `audio` objects must be Boolean values (`true` or `false`). Invalid values cause a configuration error at startup.

## 6. Certificate security overrides

The `certificateVerification` object allows specific hosts to bypass normal TLS certificate verification.

This is intended for trusted local services that use self-signed certificates or certificates that cannot be validated through the normal certificate trust process.

**This setting reduces connection security for every host listed. Use it only when necessary and only for services you trust.**

### `certificateVerification.allowInvalidCertificatesFor`

An array of exact hostnames or IP addresses for which certificate verification should be bypassed.

Default:

```json
"certificateVerification": {
  "allowInvalidCertificatesFor": []
}
```

Example:

```json
"certificateVerification": {
  "allowInvalidCertificatesFor": [
    "homeassistant.local",
    "192.168.0.151"
  ]
}
```

### Matching rules

- Hostnames are matched without regard to letter case.
- Only exact hostnames and IP addresses are accepted.
- Wildcards are not supported.
- URLs, protocols, ports, paths, and other URL components are not permitted.
- Duplicate entries are removed.
- An empty array leaves Electron's normal certificate verification behaviour unchanged.

For example, use:

```json
"allowInvalidCertificatesFor": [
  "192.168.0.151"
]
```

Do not use:

```json
"allowInvalidCertificatesFor": [
  "https://192.168.0.151:8123"
]
```

### Security implications

For a listed host, the application accepts certificate verification failures. This includes situations such as:

- Self-signed certificates that are not trusted by the operating system.
- Expired certificates.
- Certificates issued for a different hostname.
- Certificates issued by an untrusted certificate authority.

This makes it possible to connect to certain local HTTPS services without installing and maintaining a trusted certificate.

However, it also means the application cannot rely on normal certificate verification to establish the identity of that host. An attacker capable of intercepting or redirecting the connection could potentially impersonate the service.

Only add hosts that you control or otherwise trust.

**Do not add public websites or broad groups of hosts to this list.** Where possible, use properly trusted certificates instead.

## 7. Browser data and persistent sessions

The `browserData` object controls where website data is stored and whether selected data is automatically cleared.

Browser data is stored separately from the application configuration and includes information such as:

- Cookies and website login sessions.
- Local storage and IndexedDB.
- Cached website resources.
- Service workers and other website-specific storage.

Keeping this data between launches allows websites to retain login information and preferences.

### `browserData.directory`

Controls the base directory used for the browser profile.

Default:

```json
"directory": null
```

When set to `null`, the application uses its default browser-data directory inside the application user-data directory.

A custom directory can be specified:

```json
"browserData": {
  "directory": "/mnt/data/mtkb-profile"
}
```

The application creates an `mtkb` subdirectory inside the resolved directory.

For example, the configuration above results in:

```text
/mnt/data/mtkb-profile/mtkb/
```

#### Path resolution

- Absolute paths are used directly as the base directory.
- Relative paths are resolved relative to the directory containing the active `config.json`.
- `~` and home-directory paths are expanded.
- On Windows, `%USERPROFILE%` is supported.
- On Linux and other Unix-like systems, `$HOME` and `${HOME}` are supported.

Examples:

```json
"directory": null
```

```json
"directory": "/mnt/data/browser-profile"
```

### `browserData.clearCache`

Controls whether cached website resources are automatically cleared.

| Setting | Default | Behaviour |
|---|---|---|
| `browserData.clearCache.onStartup` | `false` | Clears the browser cache when the application starts. |
| `browserData.clearCache.onExit` | `false` | Clears the browser cache when the application exits. |

Example:

```json
"clearCache": {
  "onStartup": false,
  "onExit": true
}
```

Clearing the cache removes stored website resources that can normally be downloaded again. It does not intentionally clear cookies or website login sessions.

### `browserData.clearWebsiteData`

Controls whether website data is automatically cleared.

| Setting | Default | Behaviour |
|---|---|---|
| `browserData.clearWebsiteData.onStartup` | `false` | Clears website data when the application starts. |
| `browserData.clearWebsiteData.onExit` | `false` | Clears website data when the application exits. |

Example:

```json
"clearWebsiteData": {
  "onStartup": false,
  "onExit": true
}
```

Website data includes information such as:

- Cookies and website login sessions.
- Local storage and IndexedDB.
- Other persistent website-specific data.

Clearing website data can sign you out of websites and remove saved preferences or other locally stored information.

**Important:** Enabling automatic website-data cleanup can prevent websites from retaining login sessions between launches.

Cache cleanup and website-data cleanup are separate settings and can be configured independently.

## 8. Website tabs

The `tabs` array defines the websites displayed in the application's tab bar.

Each entry represents one website tab.

Example:

```json
"tabs": [
  {
    "id": "home-assistant",
    "name": "Home Assistant",
    "url": "https://www.home-assistant.io/",
    "iconPreference": "website",
    "allowPopups": false
  },
  {
    "id": "project",
    "name": "Project",
    "url": "https://github.com/alexandre-leblanc/mtkb",
    "localIcon": "icons/app.png",
    "iconPreference": "local",
    "allowPopups": false
  }
]
```

### Tab settings

| Setting | Required | Behaviour |
|---|---|---|
| `id` | Yes | Unique identifier for the tab. Used internally to identify the tab and its saved settings. |
| `name` | Yes | Display name shown in the tab bar. |
| `url` | Yes | Website URL loaded when the tab is opened. |
| `localIcon` | No | Path to a custom icon image for the tab. |
| `iconPreference` | No | Determines whether the local icon or website icon is preferred. |
| `allowPopups` | No | Determines whether the tab is allowed to open popup windows. Defaults to `false` when omitted. |
| `allowWebsiteFullscreen` | No | Determines whether the website can enter HTML fullscreen, such as fullscreen video playback. Defaults to `true` when omitted. |

### Tab identifiers

Each tab must have a unique `id`.

Identifiers should be short, descriptive, and suitable for use as configuration keys.

For example:

```json
"id": "home-assistant"
```

Changing a tab's identifier may cause previously saved per-tab settings, such as its zoom level, to no longer be associated with that tab.

### Tab names

The `name` property determines the label displayed in the application's tab bar.

For example:

```json
"name": "Home Assistant"
```

### Website URLs

The `url` property specifies the website to load.

Use a complete URL, including the protocol:

```json
"url": "https://www.home-assistant.io/"
```

### Local icons

The optional `localIcon` property specifies a custom icon image.

Example:

```json
"localIcon": "icons/app.png"
```

Relative icon paths are resolved relative to the directory containing the active `config.json`.

Local icons are useful when a website does not provide a suitable favicon or when a consistent icon is preferred.

### Icon preference

The `iconPreference` property determines which icon source the application prefers.

| Value | Behaviour |
|---|---|
| `local` | Prefers the icon specified by `localIcon`. |
| `website` | Prefers the website's favicon. |

Example:

```json
"iconPreference": "website"
```

If a preferred local icon is unavailable, the application can fall back to the website icon.

### Popup permissions

The `allowPopups` property controls whether a website tab is permitted to open popup windows.

Default:

```json
"allowPopups": false
```

Example:

```json
"allowPopups": true
```

Enable this setting only for websites that require popup windows for normal operation, such as certain authentication or account-management workflows.

### Website fullscreen permissions

The `allowWebsiteFullscreen` property controls whether a website tab can enter fullscreen using the HTML Fullscreen API.

Default:

```json
"allowWebsiteFullscreen": true
```

Example:

```json
"allowWebsiteFullscreen": false
```

When disabled, website-initiated fullscreen requests are immediately exited. This prevents websites from taking over the display with fullscreen videos or other HTML content.

This setting does not affect MTKB's own fullscreen controls, including F11, startup fullscreen, or kiosk mode.

Popup windows inherit the setting from their parent tab.

## 9. Theme customization

The `themes` object defines the colours used by the application's light and dark themes.

Both themes can be customized independently.

The application includes built-in light and dark themes. If a theme is not defined in the configuration, its built-in defaults are used. At least one of the `dark` or `light` themes must be defined. Both must be defined when `toolbar.showThemeToggle` is enabled.

Example:

```json
"themes": {
  "dark": {
    "toolbarBackground": "#181818",
    "textColor": "#cccccc",
    "navBackground": "#252525",
    "navBorder": "#383838",
    "navActiveBackground": "#3a3a3a",
    "tabBackground": "#222222",
    "tabTextColor": "#999999",
    "selectedTabBackground": "#0066cc",
    "selectedTabTextColor": "#ffffff",
    "separatorColor": "#333333"
  },
  "light": {
    "toolbarBackground": "#f0f0f0",
    "textColor": "#333333",
    "navBackground": "#ffffff",
    "navBorder": "#cccccc",
    "navActiveBackground": "#dddddd",
    "tabBackground": "#e2e2e2",
    "tabTextColor": "#444444",
    "selectedTabBackground": "#0066cc",
    "selectedTabTextColor": "#ffffff",
    "separatorColor": "#cccccc"
  }
}
```

### Theme colour settings

Each theme supports the following colour properties:

| Setting | Description |
|---|---|
| `toolbarBackground` | Background colour of the main toolbar. |
| `textColor` | General toolbar text and icon colour. |
| `navBackground` | Background colour of the navigation area. |
| `navBorder` | Border colour of the navigation area. |
| `navActiveBackground` | Background colour of the currently active navigation item. |
| `tabBackground` | Background colour of inactive tabs. |
| `tabTextColor` | Text colour of inactive tabs. |
| `selectedTabBackground` | Background colour of the selected tab. |
| `selectedTabTextColor` | Text colour of the selected tab. |
| `separatorColor` | Colour of separators between toolbar elements. |

### Colour format

Colours should be specified as hexadecimal RGB values, using the format:

```text
#RRGGBB
```

For example:

```json
"toolbarBackground": "#181818"
```

### Customizing a theme

To change a theme, edit the corresponding colour values in `config.json`.

For example, to change the dark theme's selected tab background:

```json
"selectedTabBackground": "#0066cc"
```

The light and dark themes are independent. Changing one does not automatically change the other.

The selected theme is controlled by the top-level `startupTheme` setting described in section 4.

## 10. Configuration validation

The application validates the configuration file during startup.

- `configVersion` must be `1`.
- Required properties must be present and use the documented data types.
- Boolean settings must be `true` or `false`.
- Tab IDs must be unique.
- Website URLs must be absolute HTTP or HTTPS URLs.
- Theme colours must use six-digit hexadecimal RGB values (`#RRGGBB`).
- At least one of the `dark` or `light` themes must be defined.
- Both `dark` and `light` themes are required when `toolbar.showThemeToggle` is enabled.

If a setting is invalid, the application displays a configuration error and does not open the browser tabs. Correct the configuration file and restart the application.

Unknown configuration properties generate warnings in the application logs. They do not prevent startup.
