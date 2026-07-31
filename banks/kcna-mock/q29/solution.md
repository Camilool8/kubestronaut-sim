**Open standards for container image formats, runtimes, and distribution so images and runtimes are interoperable across tools** is correct: the OCI publishes the image-spec, runtime-spec, and distribution-spec. Because build tools, registries, and runtimes all implement the same specifications, an image built with one tool can be stored in any compliant registry and run by any compliant runtime.

Why the others are wrong:

- **A managed registry service operated by the CNCF for hosting official images** — the OCI is a standards body, not a hosting service; registries such as Docker Hub or Quay are separate products that implement the OCI distribution spec.
- **A Kubernetes-only format for packaging Helm charts** — OCI standards predate any Helm integration and apply to containers generally; Helm's ability to store charts in OCI registries is just one use of the distribution spec.
- **A proprietary container runtime maintained by a single vendor** — the OCI is an open governance project under the Linux Foundation and defines specifications rather than shipping a proprietary runtime.
