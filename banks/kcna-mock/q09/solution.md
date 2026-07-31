**Job** and **CronJob** are correct: a Job creates one or more Pods and retries them until a specified number terminate successfully — ideal for batch work such as a data migration or a one-off computation. A CronJob builds on this by creating Jobs on a repeating, cron-formatted schedule, for example a nightly backup. In both cases the Pods are expected to finish and exit rather than run forever.

Why the others are wrong:

- **ReplicaSet** — a ReplicaSet's entire purpose is to keep a specified number of Pods running continuously; if a Pod exits, it is replaced, which is the opposite of run-to-completion behavior.
- **DaemonSet** — a DaemonSet keeps a long-running copy of a Pod on every node (for example a log collector); its Pods are meant to run for as long as the node exists, not to complete and stop.
