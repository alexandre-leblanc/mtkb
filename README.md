# Multi-Tab Kiosk Browser (MTKB)

A configurable multi-tab desktop browser built with Electron for kiosk displays, wall dashboards, and dedicated information screens.

MTKB lets you display multiple websites in one application window, with configurable navigation, appearance, browser sessions, and kiosk behaviour.

## Features

- **Configurable website tabs** with custom names, URLs, and icons.
- **Persistent browser sessions** so websites can retain cookies, login state, and other site data between launches.
- **Navigation controls** including back, forward, reload, and home.
- **Per-tab zoom** with optional toolbar zoom controls.
- **Light and dark themes**, including custom theme colours.
- **Audio controls**, including per-tab mute and configurable forced mute.
- **Popup permissions** configurable per tab.
- **Website fullscreen permissions** configurable per tab.
- **Startup display modes**: windowed, fullscreen, or kiosk.
- **Configurable browser-data storage** and automatic data cleanup options.
- **Maintenance tools** for clearing website data, clearing cache, and resetting browser profiles.

## Getting Started

### Requirements

- Node.js and npm
- A supported desktop operating system
- An internet connection to install dependencies and access websites

### Run from Source

1. Clone or download this repository.
2. Open a terminal in the project directory.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start MTKB:

   ```bash
   npm start
   ```

On first launch, MTKB creates its default configuration file using the included `config.example.json`.

### Command-Line Options

MTKB supports the following command-line options:

| Option | Description |
|---|---|
| `--config <path>` | Use a specific configuration file. |
| `--windowed` | Start in a normal resizable window. |
| `--fullscreen` | Start in fullscreen mode. |
| `--kiosk` | Start in kiosk mode. |
| `--help` | Display command-line help. |

Display-mode options override the startup mode in the configuration file and are mutually exclusive.

For example:

```bash
npm start -- --kiosk
```

## Configuration

MTKB is configured through a JSON configuration file. The default configuration is stored in the application's user-data directory, separate from the project source files.

A generic example configuration is included in `config.example.json`.

Configuration options include:

- Website tabs, names, URLs, and icons
- Startup display mode and theme
- Toolbar controls and audio behaviour
- Per-tab browser permissions
- Browser-data storage location
- Cache and website-data cleanup
- Light and dark theme colours

See [CONFIGURATION.md](CONFIGURATION.md) for the full configuration reference.

## Data and Privacy

MTKB uses persistent browser sessions to allow websites to retain login information and other site-specific data between launches.

MTKB itself does not currently implement an analytics or telemetry system, a project-operated account service, or cloud synchronization. It does make network requests to load configured websites and retrieve website favicons.

**MTKB does not prevent websites from collecting information, using advertising or analytics services, storing cookies, or communicating with third parties.** It is not an ad blocker or tracking blocker, and it cannot guarantee the privacy practices of the websites it displays.

See [DATA-AND-PRIVACY.md](DATA-AND-PRIVACY.md) for more information.

**Do not share your personal configuration file or browser-data directory when reporting issues.** These may contain private URLs, cookies, login sessions, and other sensitive information.

## License

MTKB is distributed under a custom source-available, non-commercial license. It is not an OSI-approved open-source license. Commercial use requires separate written permission.

See [LICENSE](LICENSE) for the complete terms.

## Feedback and Issues

Bug reports, suggestions, and feedback are welcome. When reporting an issue, please avoid including personal configuration files, browser profiles, cookies, or other private data.
