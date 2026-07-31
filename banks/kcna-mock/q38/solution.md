**Scanning images for known vulnerabilities before deployment** and **Verifying image signatures and provenance to confirm where and how the image was built** are correct: vulnerability scanning catches images that contain packages with known CVEs before they reach the cluster, and signature and provenance verification proves an image was produced by a trusted build pipeline and has not been tampered with. Together they cover both the content of the image and its supply chain.

Why the others are wrong:

- **Pulling from any public registry without restriction so teams always have the newest software** — an unrestricted registry policy widens the attack surface; hardened clusters allow pulls only from vetted, trusted registries.
- **Using the `latest` tag everywhere so security patches are picked up automatically** — `latest` is mutable, so you cannot tell which image content is actually running, which undermines scanning, provenance, and reproducibility; pinned tags or digests are the trustworthy approach.
