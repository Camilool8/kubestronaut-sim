# Solution 9

Everything here runs as root. `sudo -i` once is less error-prone than
remembering `sudo` on each command:

```bash
sudo -i
cd /opt/course/9/image
```

Look before you edit — knowing what the image does tells you what the
log should say afterwards:

```bash
cat Dockerfile agent.sh
```

Change the one line:

```dockerfile
FROM alpine:3.21
ENV RELEASE_CHANNEL=stable
COPY agent.sh /usr/local/bin/agent.sh
RUN chmod +x /usr/local/bin/agent.sh
CMD ["/usr/local/bin/agent.sh"]
```

Build and tag in one step — `-t` takes the full registry-qualified name,
so there is no separate `podman tag` to forget:

```bash
podman build -t registry:5000/pulsar-agent:v1 /opt/course/9/image
podman images | grep pulsar-agent
```

Push. The registry is plain HTTP, so TLS verification has to be off:

```bash
podman push --tls-verify=false registry:5000/pulsar-agent:v1
```

Run it detached and capture the logs:

```bash
podman run -d --name pulsar-agent registry:5000/pulsar-agent:v1
podman ps
podman logs pulsar-agent > /opt/course/9/pulsar.log
cat /opt/course/9/pulsar.log
# pulsar-agent online, release channel: stable
```

If that last line still says `beta`, the container is running an image
built before the edit. Rebuild, then remove and recreate the container —
`podman run` does not re-pull or rebuild for you:

```bash
podman rm -f pulsar-agent
podman build -t registry:5000/pulsar-agent:v1 /opt/course/9/image
podman run -d --name pulsar-agent registry:5000/pulsar-agent:v1
```

## Why sudo

Podman has two entirely separate worlds. Rootless podman keeps images in
`~/.local/share/containers`; rootful keeps them in `/var/lib/containers`.
They cannot see each other's images, so a build in one and a `run` in the
other produces a baffling "image not found" for an image you just watched
build.

On these instances the split bites in a particular way, and it is worth
recognising: a rootless `podman build` *succeeds*, and then the rootless
`podman run` fails with

```
Error: crun: mount `proc` to `proc`: Operation not permitted
```

Nothing is wrong with the image you just built. Rootless podman starts
its container in a new user namespace, and the kernel will not let a
process in one mount a fresh `/proc` while the surrounding `/proc` has
parts masked off — which is how every container runtime hides things like
`/proc/kcore`. Root podman creates no such namespace, so the restriction
never applies. That is why `sudo` is the path that works end to end here.
The same rootless/rootful split exists on real machines where both halves
work, and it is a common way to lose ten minutes.

## ENV at build time vs run time

`ENV` bakes the value into the image, which is why the check inspects the
built image and not just the Dockerfile: editing the file and forgetting
to rebuild leaves the old value in place. `podman run -e
RELEASE_CHANNEL=stable` would override it at run time without changing
the image at all — a useful thing to know, and not what this question
asked for.
