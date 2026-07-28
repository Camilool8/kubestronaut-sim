## Hint 1

Every `podman` command needs `sudo`, including the build. An image
built as your own user is invisible to the grader, and this is the single
most common way to lose all the points on this question.

The registry speaks plain HTTP, so the push needs a flag.

## Hint 2

Edit the `ENV RELEASE_CHANNEL` line in the Dockerfile — both
`ENV KEY value` and `ENV KEY=value` are accepted.

Then:
`sudo podman build -t registry:5000/pulsar-agent:v1 /opt/course/9/image`,
`sudo podman push --tls-verify=false registry:5000/pulsar-agent:v1`,
`sudo podman run -d --name pulsar-agent registry:5000/pulsar-agent:v1`.

`sudo podman logs pulsar-agent` gives you the file.
