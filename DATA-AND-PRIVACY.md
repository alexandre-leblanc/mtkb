# Data and Privacy

## Overview

Multi-Tab Kiosk Browser (MTKB) is a desktop application built with Electron. It displays websites in separate tabs and maintains persistent browser sessions so websites can retain login information and other site-specific data between application launches.

MTKB stores its application settings and browser data locally on the device. Its own application code does not currently implement an analytics or telemetry system, a project-operated account service, or cloud synchronization.

**Important:** MTKB does not make the websites it displays private. Websites and third-party services can still collect information, use cookies, load advertising and analytics services, and communicate with their own servers. MTKB is not an ad blocker or tracking blocker, and it cannot control or guarantee the privacy practices of those services.

This document describes the current behaviour of MTKB itself and the data that may be handled by the websites displayed within it.

## What MTKB Itself Does

Based on the current application code:

- MTKB does not implement an application-level analytics or telemetry system.
- MTKB does not implement a crash-reporting service.
- MTKB does not upload your configuration file, cookies, browsing history, or browser profile to the project maintainer.
- MTKB does not provide a project-operated account service or cloud synchronization.
- MTKB makes network requests to load configured websites.
- MTKB also makes HTTPS requests to retrieve website favicons for the tab bar. The favicon URLs may point to the website itself or to another host.

These statements describe features and network behaviour found in MTKB's own application code. They are not a guarantee about Electron, Chromium, operating-system services, configured websites, or third-party services.

## Websites and Third-Party Services

MTKB displays ordinary websites using Electron and Chromium. Websites are responsible for their own content, code, and privacy practices.

A website displayed in MTKB may:

- Collect browsing, usage, device, or account information.
- Store cookies, local storage, and other website-specific data.
- Load advertisements, analytics tools, tracking scripts, and other third-party resources.
- Communicate with its own servers and third-party services.
- Retain information according to its own privacy policy and retention practices.

MTKB is not a comprehensive network filter and does not block all such activity. It does not guarantee that a website or its third-party resources will respect your privacy.

The privacy practices of those websites and services are governed by their own policies and terms, not by MTKB.

## Data Stored on Your Device

MTKB and the websites it displays may store information locally, including:

- Application configuration and settings.
- Cookies and website login sessions.
- Local storage and other website-specific storage.
- Cached website files, images, and other resources.
- Other browser data maintained by Chromium.

Each configured tab uses a persistent Electron browser session associated with that tab's configured ID. This allows different tabs to maintain separate website sessions between launches.

Changing or removing a tab ID may cause MTKB to use a different browser session. Previously stored login information may then no longer be available through that tab, although its data may still exist in the browser-data directory.

## Configuration and Application Settings

MTKB uses a JSON configuration file to define website tabs, names, URLs, icons, appearance, permissions, and other application behaviour.

The default configuration file is stored in MTKB's application user-data directory, separate from the project source files.

Other application settings, such as theme preferences and per-tab zoom levels, are also stored locally.

A custom configuration file can be selected using the `--config` command-line option.

Your configuration file may contain private URLs, internal network addresses, or other personal information. Do not publish or share your personal configuration file when reporting issues or contributing to the project.

A generic `config.example.json` file is included in the repository as a starting point.

## Browser Profiles and Persistent Sessions

Browser profile data is stored separately from the application's source files.

By default, MTKB stores browser data in its application user-data directory. The `browserData.directory` configuration option can be used to specify a different location.

Browser profile data may contain sensitive information, including authentication cookies, login sessions, website preferences, and locally stored website data.

Anyone with access to the relevant files may be able to access or compromise stored website sessions.

Protect the device and its user account, and do not distribute your browser-data directory when sharing the application source code or reporting an issue.

## Network Communications

MTKB needs network access to display configured websites.

In addition to loading website content, MTKB makes HTTPS requests to retrieve favicon images used by the tab bar. The favicon URL may be supplied by the website and may be hosted on a different server.

Websites may also load content and resources from other servers, including advertising, analytics, authentication, and content-delivery services.

MTKB does not provide a complete network filter or control all requests made by websites displayed within it. Your network provider, configured websites, favicon hosts, and third-party services may each have their own network logging and data-handling practices.

## Clearing and Removing Browser Data

MTKB provides maintenance options for managing locally stored browser data:

- **Clear Cache:** Removes cached browser resources.
- **Clear Cookies and Website Data:** Clears cookies and selected website storage for the current tab or all tabs.
- **Reset Browser Profile:** Deletes the browser profile data for all tabs and restarts MTKB.

Resetting the browser profile is irreversible. It can sign you out of websites and remove locally stored website information. It does not remove your application configuration or the configured website tabs.

MTKB also supports configuration options to clear cache and/or website data automatically on startup or exit.

If you want to preserve website login sessions and local website information, back up your browser-data directory before clearing or resetting it.

## Backups and Sharing

Configuration files and browser profiles should be treated as private data.

Before sharing diagnostic information or creating a backup for someone else, check that it does not include:

- Private website URLs or internal network addresses.
- Authentication cookies or login sessions.
- Personal website preferences or locally stored information.
- Other private configuration or browser data.

Do not upload your browser-data directory to a public issue tracker or repository.

## Security Considerations

Persistent browser sessions are convenient, but they can contain sensitive information.

Users should:

- Protect access to the device running MTKB.
- Use appropriate operating-system account and file permissions.
- Only configure websites they trust.
- Keep MTKB, Electron, and its dependencies updated.
- Avoid sharing configuration files and browser profiles.
- Review the privacy policies of the websites and services they use.

## Changes to This Document

This document describes the current implementation of MTKB. It may be updated as application features, storage behaviour, and privacy controls evolve.
