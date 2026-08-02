> Run every `podman` command with `sudo`. Rootless builds do not work on
> these instances, and an image built as your own user is invisible to
> the grader.

The files for a container image are at `/opt/course/9/image` on
`instance-1`. The image runs a small agent that prints its release
channel and then idles.

1. Edit `/opt/course/9/image/Dockerfile` so the environment variable
   `RELEASE_CHANNEL` is set to `stable` instead of `beta`.
2. Build the image and tag it `registry:5000/pulsar-agent:v1`.
3. Push it to the registry at `registry:5000`. That registry speaks
   plain HTTP, so pushes need `--tls-verify=false`.
4. Run a container from the image that keeps running in the background,
   named `pulsar-agent`.
5. Save that container's log output to `/opt/course/9/pulsar.log` on
   `instance-1`.
