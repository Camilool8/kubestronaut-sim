**Prometheus scrapes HTTP endpoints such as /metrics exposed by its targets at a configured interval** is correct: Prometheus uses a pull model. Instrumented applications expose their current metric values over HTTP, and the Prometheus server periodically scrapes those endpoints, using service discovery (for example, of Kubernetes Pods and Services) to find targets automatically.

Why the others are wrong:

- **Each application pushes its metrics to Prometheus over a persistent gRPC stream** — this describes a push model, which is the opposite of how Prometheus normally works. Push is the exception (via the Pushgateway for short-lived jobs), not the standard collection path, and it uses HTTP rather than a persistent gRPC stream.
- **Prometheus reads container logs from the node and parses metric values out of them** — Prometheus collects metrics, not logs. Log collection and parsing is the job of logging tools such as Fluentd or Fluent Bit.
- **The kubelet aggregates all Pod metrics and forwards them to Prometheus on a fixed schedule** — the kubelet does expose some of its own and cAdvisor's metrics, but it does not aggregate application metrics or forward anything to Prometheus; Prometheus pulls from each target itself.
