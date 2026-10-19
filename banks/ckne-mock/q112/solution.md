**A ReferenceGrant in "apps" allowing Gateways from "infra"** is correct: Cross-namespace references to Secrets require explicit consent from the Secret owner: a `ReferenceGrant` in "apps" with from (Gateway/infra) and to (Secret). Without it, the Gateway API denies for safety — preventing certificate exfiltration.

Why the others are wrong:

- **Put the Gateway in kube-system** — the Gateway's namespace is not what the check looks at; the grant is about the Secret's namespace consenting to references from the Gateway's.
- **Annotate the Secret as public** — no such annotation exists, and Secrets have no notion of being public.
- **Copy the Secret manually into the infra namespace** — copying works once, then drifts: renewals land in the original Secret and the copy silently expires; the grant is the supported path.
