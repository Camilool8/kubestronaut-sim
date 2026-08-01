**Design for failure** is correct: this principle treats failure as a normal, expected condition of distributed systems rather than an exceptional one to be engineered away entirely. Instead of chasing an unattainable "this component never fails," cloud native systems build resilience INTO the architecture — retries with backoff, timeouts, circuit breakers, and redundancy — so that the overall system tolerates the failure of any individual part.

Why the others are wrong:

- **Infrastructure as code** — this principle is about managing infrastructure through versioned, declarative configuration rather than manual changes; it addresses reproducibility and auditability, not resilience to runtime failures.
- **The twelve-factor app methodology** — twelve-factor is a set of guidelines for building portable, scalable web applications (config via environment, stateless processes, and so on); designing explicitly around dependency failure is a narrower, complementary idea, not what twelve-factor itself defines.
- **Immutable infrastructure** — this principle is about never modifying a running server or container in place, replacing it instead; it addresses configuration drift and consistency, not how a system behaves when a dependency goes down.
