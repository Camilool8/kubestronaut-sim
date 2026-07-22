FROM debian:12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      xfce4-session xfwm4 xfdesktop4 xfce4-panel xfce4-settings xfce4-terminal \
      dbus-x11 tigervnc-standalone-server novnc websockify \
      firefox-esr openssh-client curl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash candidate \
    && printf '\necho "Exam desktop — solve questions via: ssh ckad-1 (or ckad-2). Docs: Firefox (allowlisted)."\n' >> /home/candidate/.bashrc
COPY policies.json /etc/firefox-esr/policies.json
COPY ssh_config /etc/sim/ssh_config
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 6080
ENTRYPOINT ["/entrypoint.sh"]
