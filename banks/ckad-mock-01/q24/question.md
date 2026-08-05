Namespace `auriga` runs `report-runner` as a bare Pod. Nothing owns it,
so nothing replaces it when its node is drained, and it can be neither
rolled out nor rolled back. It also runs as root with every default
privilege the runtime hands out.

Replace it with a Deployment, hardened:

1. Create Deployment `report-runner` in Namespace `auriga` with `3`
   replicas. Its Pods carry the label `app=report-runner`, and its single
   container keeps the name `report` and the image `busybox:1.37`.
2. That container must run as user ID `1000`; the kubelet must refuse to
   start it if it would run as root; it must not be able to gain more
   privileges than it starts with; it must drop **all** Linux
   capabilities; and it must run under the container runtime's default
   seccomp profile.
3. Delete the original bare Pod once the Deployment's replicas are
   running.

All three replicas must reach `Ready`.
