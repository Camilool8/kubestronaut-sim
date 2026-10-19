**Requests have extremely variable cost** is correct: One request may generate 10 tokens and another 4,000; responses are streaming (SSE) and long. Inference-aware balancers use per-replica queue/KV-cache pressure and prefix affinity, plus tuned timeouts.

Why the others are wrong:

- **GPUs can't handle more than one TCP connection** — GPUs serve many concurrent requests through batched inference; the connection count is not the constraint, the per-request compute is.
- **LLMs don't use HTTP** — LLM APIs are HTTP (often OpenAI-compatible JSON, streamed as SSE); routing them is an HTTP problem with unusual cost profiles.
- **kube-proxy blocks AI traffic** — kube-proxy neither knows nor cares what traffic carries; it forwards to endpoints, which is exactly the naive balancing the question is about.
