**Sending to replicas that already have the LoRA adapter loaded** is correct: Servers like vLLM expose which LoRA adapters are loaded. The Endpoint Picker prioritizes replicas with the adapter hot — swapping adapters costs GPU time and degrades latency for everyone in the queue.

Why the others are wrong:

- **Using only NVIDIA GPUs** — the vendor of the GPU has nothing to do with which adapter is resident in a replica's memory.
- **Compressing responses** — response compression is transport-level and unrelated to adapter placement.
- **Balancing by prompt hash across all replicas** — hashing by prompt spreads requests without regard to which replica has the adapter loaded — the cost it is meant to avoid.
