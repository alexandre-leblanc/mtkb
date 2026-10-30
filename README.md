# Multi-Tab Kiosk Browser

A configurable multi-tab browser built with Electron for kiosk displays, wall dashboards, and dedicated information screens.

Multi-Tab Kiosk Browser allows multiple websites to be displayed in a single application window, with a simple navigation toolbar and persistent browser sessions.

## Features

- Multiple configurable website tabs
- Persistent browser sessions, including cookies and website login state
- Back, forward, reload, and home navigation controls
- Per-tab website icons
- Light and dark themes
- Audio mute controls
- Configurable websites and appearance through a JSON configuration file

## Getting Started

### Requirements

- Node.js and npm
- A supported desktop operating system
- An internet connection for installing dependencies and accessing websites

### Installation from Source

1. Clone or download this repository.
2. Copy `config.example.json` to `config.json`.
3. Edit `config.json` to configure your websites and appearance.
4. Install the dependencies:

   ```bash
   npm install
   ```

5. Start the application:

   ```bash
   npm start
   ```

## Configuration

The application is configured through `config.json`, which is intentionally excluded from version control.

A generic starting configuration is provided in `config.example.json`.

Configuration includes:

- Website tabs, names, and URLs
- Local or website-provided icons
- Default theme
- Light and dark theme colors

See the configuration documentation for additional details.

## Browser Data and Privacy

The application maintains persistent browser sessions so websites can retain login information and other website data between launches.

Browser data may include cookies, local storage, cached files, and other website-specific information.

**Do not share your personal `config.json` or browser data directory when reporting issues.**

See the privacy and data documentation for details about storage and data management.

## Project Status

This project is being prepared for public release. Features, documentation, supported platforms, and installation methods are still being finalized.

## License

This project is distributed under a custom source-available license. Commercial use requires separate permission.

See `LICENSE` for the complete terms.

## Contributing and Issues

Bug reports, suggestions, and feedback are welcome. Please avoid including personal configuration files, browser profiles, cookies, or other private data in issue reports.
