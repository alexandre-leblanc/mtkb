# MTKB Build and Release Guide

This document describes how to build, package, test, and release Multi-Tab Kiosk Browser (MTKB) for Windows and Linux.

## 1. Supported packaging targets

The project currently produces four installation artifacts:

| Platform | Package format | Output |
|---|---|---|
| Windows x64 | NSIS installer | `mtkb-Setup-<version>.exe` |
| Linux x86-64 | AppImage | `mtkb-<version>-x86_64.AppImage` |
| Linux x86-64 | Debian package | `mtkb-<version>-amd64.deb` |
| Linux x86-64 | RPM package | `mtkb-<version>-x86_64.rpm` |

The application is built with Electron and electron-builder.

### Platform recommendations

- **Windows:** Use the Windows NSIS installer.
- **Ubuntu, Debian, and derivatives:** Use the Debian package or AppImage.
- **Fedora, Red Hat Enterprise Linux, Rocky Linux, AlmaLinux, and openSUSE:** Use the RPM package. Runtime installation and compatibility testing on these distributions is still pending.
- **Arch Linux and other distributions:** Use the AppImage, provided the host meets its runtime requirements.
- **Other architectures:** Only x86-64 is currently configured and tested.

RPM packaging is configured through electron-builder. The RPM artifact has been successfully built and its metadata, contents, and file permissions inspected. It has not yet been installed or runtime-tested on Fedora. Do not consider RPM distribution compatibility verified until that testing is complete.

## 2. Prerequisites

### 2.1 Common requirements

- Git
- Node.js and npm
- Access to the project repository
- Internet access to download npm dependencies and packaging tools

The project currently specifies:

- Electron: `45.1.0`
- electron-builder: `^26.18.0`

Use the project's `package-lock.json` and `npm ci` to install the locked dependency versions. Avoid using `npm install` for routine release builds because it can modify the lockfile.

The development environment used for the Linux packaging work was:

- Node.js `26.13.0`
- npm `11.20.0`

Other compatible Node.js versions may work, but the versions above are the known build environment.

### 2.2 Windows build environment

Build Windows installers from Windows.

Requirements:

- A supported Windows x64 installation
- Git for Windows
- Node.js and npm
- The project repository

No separate NSIS installation is normally required; electron-builder manages the packaging toolchain.

### 2.3 Linux build environment

Build Linux packages from a native Linux installation where possible.

Requirements:

- A supported x86-64 Linux distribution
- Node.js and npm
- Git
- Standard packaging utilities, including `dpkg` and `fakeroot` for Debian packaging, and `rpm`/`rpmbuild` for RPM packaging

On Ubuntu/Debian, the following packages provide the basic packaging utilities:

```bash
sudo apt update
sudo apt install git dpkg fakeroot rpm
```

The `rpm` package provides RPM tooling, including `rpmbuild`, on Ubuntu. It is required by the current build environment for producing RPM packages.

The build process downloads Electron and other required packaging tools through npm/electron-builder.

The Linux packaging process has been tested in Ubuntu 24.04 under WSL2. The resulting AppImage and Debian packages have also been tested on Ubuntu 22.04 and Ubuntu 26.04 Desktop. RPM packaging has been built under WSL2, but its installation and runtime behaviour have not yet been tested on Fedora.

#### WSL2 alternative

Linux packages can also be built from Ubuntu running under WSL2.

This is useful when a developer has Windows but wants to produce Linux packages without maintaining a separate Linux machine or VM.

For WSL2 builds, use the Linux filesystem rather than `/mnt/c` for the working repository. For example:

```bash
mkdir -p ~/work
cd ~/work
```

Building under the Linux filesystem avoids Windows/DrvFs file-permission behaviour that can otherwise affect packaged Linux file permissions.

WSL2 is a build alternative, not a deployment or runtime requirement. Native Linux remains the preferred environment for Linux development and packaging.

## 3. Obtaining the source

Clone the repository:

```bash
git clone https://github.com/alexandre-leblanc/mtkb.git
cd mtkb
```

The repository is private, so GitHub authentication and repository access are required.

Check out the desired branch or release commit.

Install the dependencies:

```bash
npm ci
```

For release builds, start from a clean working tree and use the intended release commit.

Check the installed tool versions:

```bash
node --version
npm --version
```

## 4. Building for Windows

Windows installers should be built on a native Windows environment.

From the project directory, install dependencies if necessary:

```powershell
npm ci
```

Build the installer:

```powershell
npm run dist:win
```

The installer is written to:

```text
dist/mtkb-Setup-<version>.exe
```

The version is taken from `package.json`.

### 4.1 Windows installer configuration

The Windows installer uses electron-builder's NSIS target.

Current configuration:

- Per-user installation by default (`perMachine: false`)
- Installation directory can be changed by the user
- Desktop shortcut enabled
- Start Menu shortcut enabled
- Shortcut name: `Multi-Tab Kiosk Browser`
- Application data is preserved when the application is uninstalled
- Documentation files are copied beside the installed application

The installer is currently unsigned. Windows may display a SmartScreen or unknown-publisher warning when it is run.

### 4.2 Windows user data

MTKB stores its configuration and browser data separately from the installed application.

The Windows application data directory is:

```text
%APPDATA%\mtkb
```

This directory contains user configuration and persistent browser data, including website sessions and login information.

Uninstalling MTKB is configured not to delete this directory. Reinstalling the application should therefore preserve the user's settings and browser sessions.

Do not delete this directory as part of a normal upgrade or uninstall procedure.

## 5. Building for Linux

Linux builds produce an AppImage, a Debian package, and an RPM package.

Install dependencies:

```bash
npm ci
```

Build all three Linux packages:

```bash
npm run dist:linux
```

The output files are written to `dist/`:

```text
dist/mtkb-<version>-x86_64.AppImage
dist/mtkb-<version>-amd64.deb
dist/mtkb-<version>-x86_64.rpm
```

The current build targets Linux x86-64 only.

### 5.1 Linux permission normalization

The Linux build uses the electron-builder `afterPack` hook:

```text
scripts/after-pack-linux.js
```

This hook runs after electron-builder packages the application files.

It normalizes permissions to avoid world-writable files being carried into the Linux packages. Directories receive mode `755`; ordinary files receive mode `644`.

The following application executables receive mode `755`:

- `mtkb`
- `chrome_crashpad_handler`
- `chrome-sandbox`

Symbolic links are left unchanged.

The hook checks the target platform and does nothing for non-Linux builds.

The Debian package's generated installation scripts also configure the Chromium sandbox executable according to the host's user-namespace support.

### 5.2 Debian package

The `.deb` package is intended for Debian-based distributions, including Ubuntu and compatible derivatives.

It provides:

- Installation under `/opt/Multi-Tab Kiosk Browser/`
- A desktop application entry
- Application menu integration
- Application documentation installed alongside the application
- Package-manager dependency declarations

The package metadata uses the `utils` section.

Install on a Debian-based system:

```bash
sudo apt install ./mtkb-<version>-amd64.deb
```

The package manager resolves the declared runtime dependencies from the distribution's repositories.

To uninstall:

```bash
sudo apt remove mtkb
```

To remove the package's configuration metadata as well:

```bash
sudo apt purge mtkb
```

Neither normal removal nor purge is intended to delete the user's MTKB application data.

### 5.3 RPM package

The `.rpm` package is intended for RPM-based distributions, including Fedora, Red Hat Enterprise Linux, Rocky Linux, AlmaLinux, and openSUSE.

The current RPM package provides:

- Installation under `/opt/Multi-Tab Kiosk Browser/`
- A desktop application entry under `/usr/share/applications/`
- Application menu integration
- Application icons under `/usr/share/icons/hicolor/`
- Application documentation installed alongside the application
- RPM dependency declarations

The package is named `mtkb`, with the version taken from `package.json`. The current build uses the x86-64 architecture.

Install on a compatible RPM-based system:

```bash
sudo dnf install ./mtkb-<version>-x86_64.rpm
```

On systems using `zypper`, the equivalent installation command is:

```bash
sudo zypper install ./mtkb-<version>-x86_64.rpm
```

To uninstall:

```bash
sudo dnf remove mtkb
```

For openSUSE:

```bash
sudo zypper remove mtkb
```

The RPM package has been built successfully and its metadata, dependencies, contents, and file permissions have been inspected. Fedora installation, application launch, upgrade, removal, and user-data preservation tests are still outstanding.

Do not consider the RPM package fully verified or claim general RPM distribution compatibility until those tests have passed.

### 5.4 AppImage

The AppImage is the portable Linux distribution format.

It does not require installation through a package manager. Download the file, make it executable, and run it:

```bash
chmod +x mtkb-<version>-x86_64.AppImage
./mtkb-<version>-x86_64.AppImage
```

The AppImage does not automatically create a desktop menu entry or install itself into the system.

#### AppImage runtime requirements

The current MTKB AppImage uses the Type 2 AppImage format and requires the FUSE 2 shared library:

```text
libfuse.so.2
```

This is important because FUSE 2 and FUSE 3 are different library interfaces. Installing FUSE 3 alone does not satisfy an application that requires `libfuse.so.2`.

FUSE (Filesystem in Userspace) allows a userspace program to provide a filesystem that can be mounted by the Linux kernel. AppImage uses this mechanism to mount its embedded application filesystem when the image is launched.

FUSE 2 and FUSE 3 can coexist on the same system.

The required package name varies by distribution. For example:

| Distribution | Example package |
|---|---|
| Ubuntu 22.04 | `libfuse2` |
| Ubuntu 24.04 and 26.04 | `libfuse2t64` |
| Other Debian-based distributions | A package providing `libfuse.so.2`; the name depends on the release |
| Fedora / Red Hat family | FUSE 2 compatibility packages, where available |
| Arch Linux / Manjaro | `fuse2` |
| openSUSE | FUSE 2 compatibility library package |

On Ubuntu, install the appropriate compatibility package:

```bash
# Ubuntu 22.04
sudo apt install libfuse2

# Ubuntu 24.04 and newer
sudo apt install libfuse2t64
```

These compatibility packages are not normally installed by default on a fresh Ubuntu Desktop installation. They may also require the Universe repository to be enabled.

The `t64` suffix refers to the distribution's 64-bit `time_t` library transition. It does not mean FUSE 3. `libfuse2` and `libfuse2t64` provide the FUSE 2 library interface.

On other distributions, consult the distribution's package manager and repositories for the package that provides `libfuse.so.2`. Package names and availability vary by distribution and release.

#### Running without FUSE mounting

If FUSE 2 cannot be installed, a Type 2 AppImage can generally be extracted and run without mounting:

```bash
./mtkb-<version>-x86_64.AppImage --appimage-extract-and-run
```

This is a fallback option. It extracts the embedded filesystem and runs the application from the extracted contents.

#### Other runtime considerations

The AppImage bundles many application dependencies, but it does not contain an entire Linux operating system.

The host system must still provide compatible system libraries and a working graphical desktop environment.

The application requires a graphical session and the libraries needed by Electron/Chromium for its windowing, graphics, audio, and desktop integration.

AppImage compatibility depends on the host distribution and its available system libraries. In particular:

- The current application binaries were inspected and the highest referenced GLIBC symbol version observed was `GLIBC_2.25`.
- This is an observed binary requirement, not a guarantee that every distribution with GLIBC 2.25 or newer is supported.
- The host must also provide the other required system libraries and a compatible graphical environment.
- Distributions using musl rather than glibc, such as Alpine Linux, are not currently tested or claimed as supported.

The AppImage is the recommended package for distributions that cannot install the Debian package, but compatibility should be tested on the intended distribution.

## 6. Application data and upgrades

MTKB stores user settings and browser profiles separately from the installed application.

On Linux, the application data directory is:

```text
~/.config/mtkb
```

This directory contains configuration, browser data, and persistent website sessions.

The Debian package is configured so that removing or purging the package does not intentionally remove the user's application data.

The AppImage also uses the normal per-user application data location.

The RPM package is intended to leave per-user application data untouched when removed. This behaviour still needs to be confirmed through Fedora installation and removal testing.

Do not remove the application data directory when upgrading MTKB unless a complete reset is intended.

For troubleshooting or before testing an upgrade, backing up the data directory is recommended.

## 7. Release procedure

### 7.1 Prepare the release

1. Confirm the intended release version in `package.json`.
2. Review the source changes.
3. Confirm that `package-lock.json` is synchronized with `package.json`.
4. Run the application's available tests and checks.
5. Review the documentation.
6. Confirm that no personal configuration, browser profiles, runtime data, or local build artifacts are included in the release commit.

Check the working tree:

```bash
git status --short --branch
```

Check whitespace errors:

```bash
git diff --check
```

### 7.2 Build Windows

On Windows:

```powershell
npm ci
npm run dist:win
```

Verify the resulting installer:

```text
dist/mtkb-Setup-<version>.exe
```

Test installation, application startup, configured tabs, and persistence of user settings and browser sessions.

### 7.3 Build Linux

On native Linux:

```bash
npm ci
npm run dist:linux
```

Verify all three artifacts:

```text
dist/mtkb-<version>-x86_64.AppImage
dist/mtkb-<version>-amd64.deb
dist/mtkb-<version>-x86_64.rpm
```

Inspect the Debian package metadata:

```bash
dpkg-deb --info dist/mtkb-<version>-amd64.deb
```

Inspect the Debian package contents:

```bash
dpkg-deb --contents dist/mtkb-<version>-amd64.deb
```

Inspect the RPM package metadata:

```bash
rpm -qip dist/mtkb-<version>-x86_64.rpm
```

Inspect the RPM package dependencies:

```bash
rpm -qpR dist/mtkb-<version>-x86_64.rpm
```

Inspect the RPM package contents:

```bash
rpm -qpl dist/mtkb-<version>-x86_64.rpm
```

Inspect the RPM package file permissions:

```bash
rpm -qp --dump dist/mtkb-<version>-x86_64.rpm
```

Verify the desktop entry. For the Debian package:

```bash
dpkg-deb --extract dist/mtkb-<version>-amd64.deb /tmp/mtkb-deb-check
desktop-file-validate /tmp/mtkb-deb-check/usr/share/applications/com.alexleblanc.mtkb.desktop
```

For the RPM package:

```bash
mkdir -p /tmp/mtkb-rpm-check
cd /tmp/mtkb-rpm-check
rpm2cpio "$OLDPWD/dist/mtkb-<version>-x86_64.rpm" | cpio -idmv
desktop-file-validate ./usr/share/applications/com.alexleblanc.mtkb.desktop
```

The `desktop-file-validate` command is provided by the `desktop-file-utils` package on Ubuntu/Debian.

Check the Linux build's executable permissions:

```bash
find dist/linux-unpacked -type f -perm /111 -printf '%m %p\n' | sort
```

Only the expected application executables should have executable permissions.

Check for world-writable files:

```bash
find dist/linux-unpacked -type f -perm -0002 -printf '%m %p\n'
```

This command should produce no output.

### 7.4 Test installations

Test the Debian package on a supported Debian-based desktop distribution.

Test the AppImage on a clean Linux desktop installation, including a system where FUSE 2 is not installed initially.

Test the RPM package on Fedora before considering RPM packaging verified. At minimum, test installation, application launch, upgrade, removal, and user-data preservation.

Verify:

- The application launches.
- The desktop entry works for the Debian and RPM packages.
- All configured tabs load.
- Existing configuration is retained.
- Browser sessions persist after closing and reopening the application.
- Uninstalling the Debian package preserves user data.
- Purging the Debian package also preserves user data.
- Removing the RPM package preserves user data.
- Upgrading an RPM installation retains the existing configuration and browser sessions.

Test on additional distributions before claiming compatibility with them.

### 7.5 Publish the release

The release must be built from a single, final commit on `main`. Build both
platforms from the same version tag so the Windows and Linux packages contain
the same source revision.

#### 7.5.1 Finalize and tag the release

1. Complete the review and testing described above.
2. Merge the approved release changes into `main`.
3. Update the local `main` branch on both the Windows and Linux build
   environments:

   ```bash
   git switch main
   git fetch origin
   git pull --ff-only origin main
   git status --short --branch
   git rev-parse HEAD
   ```

4. Confirm both environments report the same commit hash and have clean
   working trees.
5. Create an annotated tag for that commit and push it:

   ```bash
   git tag -a "v<version>" -m "MTKB v<version>"
   git show "v<version>" --no-patch
   git push origin "v<version>"
   ```

   Replace `<version>` with the release version, for example `1.0.0`.
   Do not move or reuse a tag that has already been published.

#### 7.5.2 Build from the release tag

On each build environment, check out the same tag:

```bash
git fetch origin --tags
git switch --detach "v<version>"
git status --short --branch
git rev-parse HEAD
```

Confirm the commit hash matches on both environments and matches the tagged
release commit.

Then, while still checked out at that tag:

- On Windows, follow the build instructions in Section 7.2.
- On Linux, follow the build instructions in Section 7.3.

Do not modify source files or build from different commits between platforms.
If a release build needs a source change, make and review that change on `main`,
then create a new version tag.

#### 7.5.3 Stage the release assets

Copy the four tested packages into one release staging folder:

- `mtkb-Setup-<version>.exe`
- `mtkb-<version>-x86_64.AppImage`
- `mtkb-<version>-amd64.deb`
- `mtkb-<version>-x86_64.rpm`

Generate a SHA-256 checksum file from that folder:

```bash
sha256sum mtkb-Setup-<version>.exe \
  mtkb-<version>-x86_64.AppImage \
  mtkb-<version>-amd64.deb \
  mtkb-<version>-x86_64.rpm > SHA256SUMS.txt

sha256sum --check SHA256SUMS.txt
```

Confirm that all four checks pass. Include `SHA256SUMS.txt` with the packages.

#### 7.5.4 Create the GitHub Release

1. Open the repository on GitHub and go to **Releases**.
2. Select **Draft a new release**.
3. Choose the existing `v<version>` tag. Do not create a different tag
   through the release form.
4. Set the release title to `MTKB v<version>`.
5. Add release notes covering the changes, installation instructions,
   tested platform compatibility, and any known limitations.
6. Upload the four packages and `SHA256SUMS.txt`.
7. Review the tag, title, release notes, and all five uploaded assets.
8. Publish the release. Mark it as a pre-release only when that is
   intentional.

GitHub also provides automatically generated source-code archives. These are
separate from the five package and checksum assets uploaded above.

After publishing, revisit the release page and verify that all five assets
are present and downloadable. Verify the published checksum file against the
downloaded packages.

## 8. Known limitations

- Only Windows x64 and Linux x86-64 packaging targets are currently configured.
- Windows installers are unsigned.
- Custom application icons have not yet been incorporated.
- Linux AppImage requires FUSE 2 compatibility support for normal mounting.
- RPM packaging is configured and builds successfully, but Fedora runtime testing is still outstanding.
- Compatibility with distributions other than the tested Ubuntu releases has not been formally verified.
- Windows all-users installation behaviour has not been fully validated.
- Automatic application launch at login is not configured.

## 9. Troubleshooting

### AppImage reports `libfuse.so.2` missing

Install the FUSE 2 compatibility library appropriate for the distribution.

For Ubuntu:

```bash
# Ubuntu 22.04
sudo apt install libfuse2

# Ubuntu 24.04 and newer
sudo apt install libfuse2t64
```

If FUSE cannot be installed, try the extraction fallback:

```bash
./mtkb-<version>-x86_64.AppImage --appimage-extract-and-run
```

### AppImage is not executable

Make it executable:

```bash
chmod +x mtkb-<version>-x86_64.AppImage
```

### Debian package reports missing dependencies

Allow the package manager to resolve dependencies from the configured repositories:

```bash
sudo apt --fix-broken install
```

If dependencies remain unavailable, verify that the distribution release is supported and that its package repositories are enabled.

### RPM package reports missing dependencies

Use the distribution's package manager to resolve dependencies from its configured repositories. For Fedora:

```bash
sudo dnf install ./mtkb-<version>-x86_64.rpm
```

If dependencies remain unavailable, verify that the distribution release is supported and that its repositories provide the required packages.

### Application settings or browser sessions appear missing

Check that the expected per-user data directory still exists:

Linux:

```bash
ls -lah ~/.config/mtkb
```

Windows:

```text
%APPDATA%\mtkb
```

Do not delete these directories when troubleshooting an installation problem. They contain persistent user configuration and browser data.

---

**End of build and release guide.**
