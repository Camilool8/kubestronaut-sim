**`volumeClaimTemplates`** is correct: a StatefulSet uses `volumeClaimTemplates` to provision one PersistentVolumeClaim PER REPLICA, named predictably from the StatefulSet's own name and ordinal (e.g. `data-web-0`, `data-web-1`). When a Pod is rescheduled, the StatefulSet controller reattaches that same claim to the Pod with the matching ordinal, which is exactly what gives each replica continuous, individual storage — something a Deployment's shared Pod template cannot express.

Why the others are wrong:

- **`podManagementPolicy`** — this only controls whether Pods are created/terminated one at a time in order (`OrderedReady`, the default) or all at once (`Parallel`); it says nothing about storage.
- **`serviceName`** — this names the headless Service that gives each replica its own stable network identity (`web-0.web`, `web-1.web`, …); it is unrelated to which volume a replica gets.
- **`updateStrategy`** — this governs how replicas are rolled over during an update (e.g. `RollingUpdate` with a `partition`); it has no role in provisioning or attaching storage.
