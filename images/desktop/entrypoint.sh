#!/usr/bin/env bash
set -euo pipefail
echo "waiting for shared ssh key..."
until [ -f /shared/ssh/id_ed25519 ]; do sleep 2; done
install -d -m 700 -o candidate -g candidate /home/candidate/.ssh
install -m 600 -o candidate -g candidate /shared/ssh/id_ed25519 /home/candidate/.ssh/id_ed25519
install -m 644 -o candidate -g candidate /etc/sim/ssh_config /home/candidate/.ssh/config

su - candidate -c 'Xvnc :1 -geometry 1440x900 -depth 24 -SecurityTypes None -localhost yes' &
xvnc_pid=$!
until su - candidate -c 'DISPLAY=:1 xset q' >/dev/null 2>&1; do
  kill -0 "$xvnc_pid" 2>/dev/null || { echo "Xvnc failed to start" >&2; exit 1; }
  sleep 1
done
su - candidate -c 'DISPLAY=:1 dbus-launch startxfce4' &
websockify --web /usr/share/novnc 6080 localhost:5901 &
echo "desktop ready: noVNC on :6080"
wait -n   # exit (and let compose restart us) if any component dies
