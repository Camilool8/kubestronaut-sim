#!/usr/bin/env bash
set -euo pipefail
echo "waiting for shared ssh key..."
until [ -f /shared/ssh/id_ed25519 ]; do sleep 2; done
install -d -m 700 -o candidate -g candidate /home/candidate/.ssh
install -m 600 -o candidate -g candidate /shared/ssh/id_ed25519 /home/candidate/.ssh/id_ed25519
install -m 644 -o candidate -g candidate /etc/sim/ssh_config /home/candidate/.ssh/config

# Clipboard flags are TigerVNC's defaults, set explicitly because the
# exam depends on them: the UI pushes values from the question panel
# into this session's clipboard so candidates never retype a resource
# name. TigerVNC >= 1.8 bridges the X selections itself (no vncconfig,
# no autocutsel — a second clipboard owner causes copy-twice bugs), and
# >= 1.10 carries UTF-8 via the extended clipboard encoding.
# MaxCutText is raised from the 256KiB default so pasting a whole
# manifest is not silently truncated.
clipboard_args='-AcceptCutText=1 -SendCutText=1 -SetPrimary=1 -SendPrimary=1 -MaxCutText 2097152'
# The geometry is only the *initial* framebuffer: the browser client sets
# resizeSession, and TigerVNC honors SetDesktopSize with an arbitrary size,
# so the desktop ends up at the exam pane's real pixel dimensions within a
# second of connecting. Starting at 1080p rather than 1440x900 means the
# first negotiated resize is a small correction on a typical laptop instead
# of a visible jump, and a maximised window on a large display never has to
# scale up from a smaller frame while it waits.
su - candidate -c "Xvnc :1 -geometry 1920x1080 -depth 24 -SecurityTypes None -localhost yes ${clipboard_args}" &
xvnc_pid=$!
until su - candidate -c 'DISPLAY=:1 xset q' >/dev/null 2>&1; do
  kill -0 "$xvnc_pid" 2>/dev/null || { echo "Xvnc failed to start" >&2; exit 1; }
  sleep 1
done
su - candidate -c 'DISPLAY=:1 dbus-launch startxfce4' &
websockify --web /usr/share/novnc 6080 localhost:5901 &
echo "desktop ready: noVNC on :6080"
wait -n   # exit (and let compose restart us) if any component dies
