**The probe validates something shallow before the app is ready** is correct: "Pod Endpoint Availability" depends on the probe's HONESTY: a TCP check passes with an open socket and a cold app. Endpoints enter balancing the instant they become ready — the probe is the contract.

Why the others are wrong:

- **kube-proxy is always too slow** — kube-proxy propagates endpoint changes within seconds; that is not what produces a 3-second window of errors from a pod that reports ready.
- **EndpointSlices have a mandatory 3s delay** — there is no built-in delay; the endpoint is published the moment the pod's readiness condition becomes true.
- **502s are normal in rollouts** — a correct probe makes rollouts zero-error; 502s mean traffic reached a pod before its application could answer.
