#!/usr/bin/env bash
set -euo pipefail
echo "waiting for shared ssh key..."
until [ -s /shared/ssh/id_ed25519 ]; do sleep 2; done
install -d -m 700 -o candidate -g candidate /home/candidate/.ssh
install -m 600 -o candidate -g candidate /shared/ssh/id_ed25519 /home/candidate/.ssh/id_ed25519
install -m 644 -o candidate -g candidate /etc/sim/ssh_config /home/candidate/.ssh/config

clipboard_args='-AcceptCutText=1 -SendCutText=1 -SetPrimary=1 -SendPrimary=0 -MaxCutText 2097152'
su - candidate -c "Xvnc :1 -geometry 1920x1080 -depth 24 -SecurityTypes None -localhost yes ${clipboard_args}" &
xvnc_pid=$!
until su - candidate -c 'DISPLAY=:1 xset q' >/dev/null 2>&1; do
  kill -0 "$xvnc_pid" 2>/dev/null || { echo "Xvnc failed to start" >&2; exit 1; }
  sleep 1
done
su - candidate -c 'DISPLAY=:1 dbus-launch startxfce4' &
websockify --heartbeat=30 --web /usr/share/novnc 6080 localhost:5901 &
echo "desktop ready: noVNC on :6080"
wait -n
