**A packaged collection of Kubernetes manifest templates, plus a set of default configuration values, versioned and installed as a single unit** is correct: a chart bundles everything needed to deploy an application — Deployments, Services, ConfigMaps, and so on — as parameterized templates. Helm renders those templates against a values file (the defaults, optionally overridden at install time) to produce the final manifests it applies, which is what lets the same chart install a small dev instance or a large production one just by changing values.

Why the others are wrong:

- **A container image built specifically to run inside a Helm-managed cluster** — a chart contains no container image at all; it references images by name and tag inside its templates, the same as any other manifest would.
- **A CustomResourceDefinition that extends the Kubernetes API with new object kinds** — CRDs are a separate mechanism for adding new API types; a chart is a packaging and templating tool for existing resource kinds, and can optionally include CRDs among the manifests it installs, but is not one itself.
- **A CI/CD pipeline definition that builds and tests an application before deployment** — build and test pipeline configuration (Jenkinsfiles, GitHub Actions workflows, and the like) is a separate concern from Helm, which only handles packaging and installing Kubernetes manifests.
