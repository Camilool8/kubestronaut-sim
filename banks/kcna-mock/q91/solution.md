**To run one or more setup tasks to completion BEFORE any of the Pod's main (app) containers start, with each init container required to finish successfully before the next one begins** is correct: common uses include waiting for a dependency to become reachable, running a one-time database migration, or fetching configuration into a shared volume — work that must finish before the application itself starts, but does not belong inside the application's own long-running container.

Why the others are wrong:

- **To run in the background alongside the main containers for the Pod's entire lifetime, monitoring their health** — that ongoing, side-by-side role is closer to what a sidecar container provides; an init container's defining trait is that it runs to completion and then stops, before the app containers even start.
- **To provide a lightweight base image that all of the Pod's other containers inherit from** — containers within a Pod are independent processes, each from its own image; none of them "inherit" from another container's image at runtime.
- **To restart the Pod's main container automatically whenever it crashes** — restart behavior for a Pod's containers is governed by the Pod's `restartPolicy`, applied by the kubelet, and has nothing to do with init containers.
