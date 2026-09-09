**It is ignored: policyTypes decides what is enforced** is correct: a NetworkPolicy enforces only the directions listed in `spec.policyTypes`. With `policyTypes: [Ingress]` the `egress:` block is accepted and stored but never evaluated, so the selected pods keep unrestricted egress. "Decorative" egress rules slip through reviews — a frequent trap in audits and exams. To make the block count, add `Egress` to `policyTypes`.

Why the others are wrong:

- **It is applied normally** — enforcement follows `policyTypes`; a direction not listed there is never evaluated, however many rules its section holds.
- **It causes a validation error** — the API server accepts the manifest: an `egress` section is a valid field regardless of `policyTypes`, which is exactly why the mistake is silent.
- **It blocks all egress** — a deny-all effect only arises when `Egress` is in `policyTypes` and the rules match nothing. Without `Egress` there, egress is not isolated at all.
