FROM debian:12-slim
# thunar is not here to browse files. xfdesktop does not exec a .desktop
# file on the desktop itself — it hands it to the org.xfce.FileManager
# D-Bus service, and with no provider double-clicking either icon failed
# with "This feature requires a file manager service to be present (such
# as the one supplied by Thunar)". The panel launchers always worked
# because xfce4-panel execs them directly, which is why this went unseen.
# It is D-Bus activated, so nothing runs until an icon is used.
RUN apt-get update && apt-get install -y --no-install-recommends \
      xfce4-session xfwm4 xfdesktop4 xfce4-panel xfce4-settings xfce4-terminal \
      thunar \
      dbus-x11 tigervnc-standalone-server novnc websockify x11-xserver-utils \
      firefox-esr openssh-client curl ca-certificates procps \
      fonts-jetbrains-mono \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash candidate \
    && printf '\n[ -f /shared/exam/motd ] && cat /shared/exam/motd\n' >> /home/candidate/.bashrc
COPY policies.json /etc/firefox-esr/policies/policies.json
COPY policies.json /usr/lib/firefox-esr/distribution/policies.json
COPY ssh_config /etc/sim/ssh_config

# Ready-to-go desktop: wallpaper, panel launchers (Terminal + Firefox),
# desktop icons, themed terminal, and a terminal auto-opened at session
# start showing the per-bank welcome banner (/shared/exam/motd via bashrc).
COPY assets/wallpaper.png /usr/share/backgrounds/kubestronaut-sim.png
COPY --chown=candidate:candidate assets/Desktop /home/candidate/Desktop
COPY --chown=candidate:candidate assets/autostart /home/candidate/.config/autostart
COPY --chown=candidate:candidate assets/panel /home/candidate/.config/xfce4/panel
COPY --chown=candidate:candidate assets/xfconf /home/candidate/.config/xfce4/xfconf/xfce-perchannel-xml
COPY --chown=candidate:candidate assets/terminalrc /home/candidate/.config/xfce4/terminal/terminalrc
RUN chmod +x /home/candidate/Desktop/*.desktop

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 6080
ENTRYPOINT ["/entrypoint.sh"]
