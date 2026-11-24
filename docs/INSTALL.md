# Installing ArboDat+

The ArboDat+ desktop app runs ArboDat+ on your own computer, or connects to an ArboDat+ server
that your institute runs. On your own computer it needs **Docker**. The app downloads ArboDat+
into Docker, starts and stops it, backs up the database and installs updates. You never have to
type a Docker command.

1. [Install Docker](#1-install-docker). Skip this if you only connect to a server.
2. [Install the app](#2-install-the-app) for your system.
3. [First start](#3-first-start).

Running ArboDat+ on a server for several people is described in [deploy/README.md](../deploy/README.md).

## What you need

| System | Version | Docker |
|---|---|---|
| macOS | 13 Ventura or newer, Apple silicon or Intel | Docker Desktop |
| Windows | 10 (22H2) or 11, x64 | Docker Desktop (with WSL 2) |
| Linux | Ubuntu 22.04 / Debian 12 or newer, x64 or arm64 | Docker Engine or Docker Desktop |

The first installation downloads about 400 MB. Afterwards ArboDat+ works without internet, except for
the vocabularies from DANTE and the map tiles.

## 1. Install Docker

### macOS and Windows: Docker Desktop

Install Docker Desktop for [Mac](https://docs.docker.com/desktop/setup/install/mac-install/) or
[Windows](https://docs.docker.com/desktop/setup/install/windows-install/), start it once, and
accept its terms. On Windows, keep the default "Use WSL 2" setting. The installer sets up WSL 2 if
it is missing and may ask you to restart Windows.

Docker Desktop must be running whenever you use ArboDat+ on your computer. In its settings you can
let it start when you log in.

> Docker Desktop is free for personal use, education, non-commercial open-source projects and
> small businesses. Larger organisations need a paid subscription. If you are unsure whether that
> applies to you, ask your IT department, or see Docker's
> [licence FAQ](https://docs.docker.com/subscription/desktop-license/).

### Linux: Docker Engine

Install Docker Engine **and the Compose plugin** with
[Docker's instructions for your distribution](https://docs.docker.com/engine/install/). Use Docker's
own packages (`docker-ce`, `docker-compose-plugin`), not the snap: the snap version of Docker
can't read the app's data folder, and the app tells you so. Docker Desktop for
[Linux](https://docs.docker.com/desktop/setup/install/linux/) works too.

Then allow your user to use Docker without `sudo`, and **log out and in again** (or restart):

```sh
sudo usermod -aG docker $USER
```

Members of the `docker` group can control the whole computer through Docker. This is the normal
setup for a personal computer. On a shared computer, ask your administrator first. See
[Docker's notes](https://docs.docker.com/engine/install/linux-postinstall/).

## 2. Install the app

Download the file for your system from the
[releases page](https://github.com/cau-kiel-ai/arbodat-plus/releases). Open the newest release and
look under **Assets**:

| System | File |
|---|---|
| macOS (Apple silicon and Intel) | `ArboDat-Plus_<version>_universal.dmg` |
| Windows | `ArboDat-Plus_<version>_x64-setup.exe` |
| Ubuntu, Debian (x64) | `ArboDat-Plus_<version>_amd64.deb` |
| Ubuntu, Debian (arm64) | `ArboDat-Plus_<version>_arm64.deb` |
| Other Linux (x64) | `ArboDat-Plus_<version>_amd64.AppImage` |
| Other Linux (arm64) | `ArboDat-Plus_<version>_aarch64.AppImage` |

`SHA256SUMS` lists the checksum of every file, so you can check a download if you want to.

The app isn't signed with a paid Apple or Microsoft certificate yet. That's why macOS and Windows warn you the
first time you open it. The steps below are the ones those warnings expect you to take.

### macOS

1. Open the `.dmg` and drag **ArboDat+** into **Applications**.
2. Open ArboDat+ from Applications. macOS says it *could not verify that "ArboDat+" is free of
   malware*. Click **Done** (not "Move to Trash").
3. Open **System Settings → Privacy & Security** and scroll down to **Security**. Next to
   *"ArboDat+" was blocked to protect your Mac*, click **Open Anyway**, confirm with
   **Open Anyway** again, and enter your password.

You only do this once. From then on ArboDat+ opens normally. (On macOS 13 and 14,
Control-click the app → **Open** also works.)

If macOS instead says that ArboDat+ *is damaged and can't be opened*, the download was flagged
in a way that "Open Anyway" doesn't cover. Remove the flag in Terminal, then open the app again:

```sh
xattr -dr com.apple.quarantine /Applications/ArboDat+.app
```

macOS may ask whether ArboDat+ may access your **Documents** folder (that's where backups go) and
your **Downloads** folder (exports). Allow both. Because the app isn't signed yet, macOS may ask again after an update.

### Windows

1. Run `ArboDat-Plus_<version>_x64-setup.exe`. Your browser may first say the file *isn't commonly
   downloaded*. Choose **Keep**.
2. **Windows protected your PC** (SmartScreen): click **More info**, then **Run anyway**.
3. The installer needs no administrator rights. It installs ArboDat+ for your user and adds it to
   the Start menu.

If Windows blocks the installer without a **Run anyway** button, **Smart App Control** is switched
on. It allows no exceptions. You can turn it off under **Windows Security → App & browser
control → Smart App Control settings**. On recent Windows 11 versions you can switch it back on
later. On older versions, turning it back on needs a reinstall of Windows, so ask your IT department first.

### Linux

**.deb (Ubuntu, Debian):** install it with apt, which also installs the libraries it needs:

```sh
sudo apt install ./ArboDat-Plus_<version>_amd64.deb
```

ArboDat+ then appears in your applications menu.

**AppImage (other distributions):** make it executable and start it:

```sh
chmod +x ArboDat-Plus_<version>_amd64.AppImage
./ArboDat-Plus_<version>_amd64.AppImage
```

AppImages need FUSE 2. If it doesn't start and mentions `libfuse.so.2`, install it:
`sudo apt install libfuse2t64` on Ubuntu 24.04 and newer, `sudo apt install libfuse2` on
Ubuntu 22.04 and Debian. Other distributions call the package `fuse` or `fuse2`.

## 3. First start

ArboDat+ opens its **Control Center**:

- **ArboDat+ on this computer:** if Docker is ready, click **Install ArboDat+**. The app downloads
  ArboDat+ and creates a new, empty database. When it's done, click **Open ArboDat+**. If Docker
  isn't ready, the Control Center shows why and links to the right instructions. Fix it and the
  status updates.
- **ArboDat+ on a server:** click **Use a server** and enter the address your institute gave you.

Later, the gear button in the top-right corner of ArboDat+ brings you back to the Control Center.
There you can start and stop ArboDat+, make and restore backups, and change settings.

Closing the window quits the app, but ArboDat+ keeps running in Docker until you click **Stop**
or quit Docker.

### Updating

Download and install the new version of the app over the old one, the same way as above. At the
next start, the app offers to **Update now**. It backs up your database first. If the new version
doesn't start, you can try again or go back to the previous version and that backup.

## Uninstalling

First decide what happens to your data. **Backups** in your backup folder (by default
`Documents/ArboDat+ Backups`) are never deleted by the app.

- **Remove ArboDat+ from Docker:** Control Center → **Settings** → **Remove ArboDat+ from Docker**. This removes
  the containers but keeps the database (the Docker volume `arbodat-plus-database`), so a new
  installation finds your data again. Only `docker volume rm arbodat-plus-database` deletes the
  database itself. Make a backup first.
- **Remove the app:** macOS: drag ArboDat+ from Applications to the Trash. Windows:
  **Settings → Apps → Installed apps → ArboDat+ → Uninstall**. Linux: `sudo apt remove arbo-dat`
  (that's the `.deb` package's name) or delete the AppImage.

## Something doesn't work

Control Center → **Diagnostics** → **Create Report** collects the versions, the Docker status and
the latest log lines into one text, with passwords removed. Copy it into an
[issue](https://github.com/cau-kiel-ai/arbodat-plus/issues) or an e-mail to the ArboDat+ team.
