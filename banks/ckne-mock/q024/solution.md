**Gateway API Inference Extension** is correct: The `Gateway API Inference Extension` adds CRDs like `InferencePool` and an Endpoint Picker that routes based on model-server metrics — queue depth, KV-cache utilization, LoRA adapters — instead of blind round-robin.

Why the others are wrong:

- **the CNCF LLMProxy Operator** — there is no such CNCF project; the inference work lives inside the Gateway API SIG as an extension, not as a separate operator.
- **MetalLB AI mode** — MetalLB announces LoadBalancer addresses on bare metal (L2/BGP); it has no notion of models, queues or GPUs.
- **Kubeflow Pipelines Serving** — Kubeflow Pipelines orchestrates ML workflows; serving traffic routing is not what it does, and it does not extend the Gateway API.
