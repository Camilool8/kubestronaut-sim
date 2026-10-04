**Gateways route by path/header/SNI, not by body** is correct: Classic routing doesn't inspect payloads. The Body-Based Routing extension (Envoy ext-proc in the Inference Gateway) parses the JSON, promotes `model` to a header, and normal HTTPRoute/InferencePool routing decides the destination.

Why the others are wrong:

- **It's not a problem; gateways read JSON natively** — standard HTTP routing operates on request metadata; parsing bodies is expensive and outside HTTPRoute matching, which is why an extension exists for it.
- **Switch the protocol to UDP** — the API is HTTP/JSON; changing transport would break every client and still leave the routing key inside the payload.
- **Use NodePort** — a NodePort exposes a port; it makes no routing decision, let alone one based on a JSON field.
