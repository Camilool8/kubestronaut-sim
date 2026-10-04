**Mapping the model name to an InferencePool, with criticality** is correct: `InferenceModel` associates the logical model name (what the client requests) with the `InferencePool` serving it, defines criticality (for prioritization/shedding under load) and enables canary between model versions/adapters.

Why the others are wrong:

- **Training the model inside the cluster** — no Gateway API resource trains anything; the extension routes requests to servers that already have the model loaded.
- **Defining how many GPUs each node exposes to the scheduler** — GPU exposure to the scheduler is done by device plugins and node resources; the inference CRDs describe routing, not hardware.
- **Replacing the model server's Deployment** — the model server keeps its Deployment; the InferencePool selects its pods, and InferenceModel maps a name onto that pool.
