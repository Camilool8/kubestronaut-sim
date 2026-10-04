**backendRefs references the InferencePool by group/kind** is correct: `backendRefs` is extensible by group/kind. Pointing at the InferencePool, the final endpoint decision leaves classic balancing and goes to the EPP (queue/KV-cache/LoRA metrics).

Why the others are wrong:

- **Via an inference=true annotation** — annotations cannot redirect a route's backend; the reference must name the target object.
- **By swapping the Gateway for a DaemonSet** — the Gateway remains the entry point; the extension adds an endpoint-picking step behind it, not a different workload type.
- **Impossible; backendRefs only accepts Service** — `backendRefs` accepts any group/kind an implementation supports; Service is only the default (`core`, `Service`).
