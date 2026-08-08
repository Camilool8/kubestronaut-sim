FROM golang:1.24 AS opener
WORKDIR /src
COPY opener/ ./
ENV CGO_ENABLED=0 GOFLAGS=-buildvcs=false
RUN go build -o /out/sim-opener .

# Debian 13 for the VNC stack, not the browser. Bookworm pinned noVNC at 1.3.0
# and TigerVNC at 1.12, both from 2021, and that is what the candidate actually
# looks through all exam. firefox-esr is 140.13 either way, and ESR is what the
# real exam environment runs.
FROM debian:13-slim
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

COPY assets/wallpaper.png /usr/share/backgrounds/kubestronaut-sim.png
COPY --chown=candidate:candidate assets/Desktop /home/candidate/Desktop
COPY --chown=candidate:candidate assets/autostart /home/candidate/.config/autostart
COPY --chown=candidate:candidate assets/panel /home/candidate/.config/xfce4/panel
COPY --chown=candidate:candidate assets/xfconf /home/candidate/.config/xfce4/xfconf/xfce-perchannel-xml
COPY --chown=candidate:candidate assets/terminalrc /home/candidate/.config/xfce4/terminal/terminalrc
RUN chmod +x /home/candidate/Desktop/*.desktop

COPY --from=opener /out/sim-opener /usr/local/bin/sim-opener

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 6080 6081
ENTRYPOINT ["/entrypoint.sh"]
