**Annotations** is correct: annotations are key-value pairs in an object's metadata meant for arbitrary, non-identifying information — build details, commit SHAs, URLs, tool configuration, and similar. They can hold larger and more free-form values than labels, and Kubernetes never uses them to select or group objects, which is exactly what the CI system wants here.

Why the others are wrong:

- **Labels** — labels are identifying key-value pairs specifically designed to be queried by selectors for grouping objects; putting build metadata in labels invites accidental matching and is the wrong tool for non-identifying data.
- **Label selectors** — a selector is the query mechanism that matches objects by their labels; it does not store metadata on an object at all.
- **Namespaces** — a namespace scopes and partitions resources within a cluster (for example per team or environment); it is not a way to attach metadata to an individual object.
