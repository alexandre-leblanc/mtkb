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

## 5. Certificate security overrides

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

## 6. Browser data and persistent sessions

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

```json
"directory
