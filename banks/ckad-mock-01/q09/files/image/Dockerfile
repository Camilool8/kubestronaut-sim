FROM alpine:3.21
ENV RELEASE_CHANNEL=beta
COPY agent.sh /usr/local/bin/agent.sh
RUN chmod +x /usr/local/bin/agent.sh
CMD ["/usr/local/bin/agent.sh"]
