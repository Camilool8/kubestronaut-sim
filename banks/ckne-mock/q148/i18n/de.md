## Question

Warum verbessert Prompt-PREFIX-Affinität (prefix-cache aware) das Routing die Latenz auf LLM-Servern wie vLLM dramatisch?

## Options

- Reduziert die Antwortgröße
- Komprimiert das Modell vor jedem Request
- Vermeidet den TLS-Handshake zwischen Gateway und jeder Replika
- Nutzt den Prefix-KV-Cache wieder und spart den vollen Prefill

## Solution

**Nutzt den Prefix-KV-Cache wieder und spart den vollen Prefill** ist die richtige Antwort: Prefill ist der teure Teil. Liegt der Präfix (z. B. langer System-Prompt) schon im KV-Cache einer Replika, spart das Senden derselben Konversation dorthin diese Kosten und senkt die TTFT. "Blindes" Balancing verteilt und verschwendet den Cache.
