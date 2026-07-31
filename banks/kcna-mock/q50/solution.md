**Use Kustomize with a shared base and per-environment overlays that patch the base** is correct: Kustomize is a template-free way to customize Kubernetes manifests. A common base holds the shared YAML, and each environment gets an overlay that patches only what differs, such as replica counts and image tags. It is built into kubectl (`kubectl apply -k`), so no templating language is introduced.

Why the others are wrong:

- **Write a Helm chart and template every field with Go template syntax** — Helm would work, but it introduces exactly the templating language the team wants to avoid; Kustomize achieves the per-environment variation with plain YAML patches.
- **Maintain three complete, independent copies of the manifests, one per environment** — Duplicating manifests causes drift and triples the maintenance burden; every shared change must be applied three times.
- **Store environment differences in a single ConfigMap that all environments share** — A ConfigMap carries runtime configuration data for applications; it cannot change manifest-level fields like a Deployment's replica count or container image tag.
