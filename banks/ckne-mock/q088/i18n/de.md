## Question

Was ist LoRA-aware Routing in Inference-Gateways?

## Options

- Nur NVIDIA-GPUs verwenden
- An Replikas senden, die den LoRA-Adapter bereits geladen haben
- Antworten komprimieren
- Per Prompt-Hash über alle Replikas balancieren

## Solution

**An Replikas senden, die den LoRA-Adapter bereits geladen haben** ist die richtige Antwort: Server wie vLLM melden, welche LoRA-Adapter geladen sind. Der Endpoint Picker bevorzugt Replikas mit heißem Adapter — Adapter-Swaps kosten GPU-Zeit und verschlechtern die Latenz für alle in der Queue.
