**As environment variables in a container, for example with envFrom** and **As files in a volume mounted into the container** are correct: these are the two standard consumption paths for a ConfigMap. A Pod can reference individual keys (or the whole ConfigMap with `envFrom`) as container environment variables, or mount the ConfigMap as a volume so each key appears as a file whose content is the value. Mounted files are even updated when the ConfigMap changes, while environment variables are fixed at container start.

Why the others are wrong:

- **The kubelet injects every ConfigMap in the namespace into all containers automatically** — ConfigMaps are never injected implicitly; the Pod spec must explicitly reference a ConfigMap through env vars or a volume before its data becomes visible.
- **By pulling the ConfigMap as a container image layer at startup** — ConfigMaps are Kubernetes API objects, not image layers; container images come from a registry and are unrelated to how ConfigMap data reaches a container.
