**Labels are key/value pairs used to identify and SELECT objects (by Services, ReplicaSets, and `kubectl` queries, among others), while annotations attach arbitrary, non-identifying metadata that is not used for selection** is correct: this is the whole reason both exist. Labels must be short, follow strict key/value syntax, and are what selectors match against; annotations can hold much larger, less structured data — a build timestamp, a changelog URL, or configuration read by a controller — precisely because nothing selects objects by matching against them.

Why the others are wrong:

- **Labels can only be added to Pods, while annotations can be added to any object** — labels and annotations are both available on essentially every Kubernetes object (Pods, Services, Nodes, Deployments, and more); neither is Pod-exclusive.
- **Annotations are immutable once set, while labels can be changed at any time** — both labels and annotations can be added, changed, or removed on an existing object at any time; neither is immutable by design.
- **Labels are stored in etcd, while annotations are stored only in memory on the API server** — both labels and annotations are part of an object's metadata and are persisted to etcd identically; there is no such storage distinction.
