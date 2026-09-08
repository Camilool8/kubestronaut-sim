## Question

Ein neuer Node bleibt NotReady mit "container runtime network not ready: cni plugin not initialized". Was prüfen Sie?

## Options

- Ob etcd kompaktiert und ohne Speicher-Alarme ist
- Ob der Node eine GPU hat
- Ob das CNI-DaemonSet auf dem Node läuft und eine Config in /etc/cni/net.d/ liegt
- Ob kube-scheduler auf dem Node läuft

## Solution

**Ob das CNI-DaemonSet auf dem Node läuft und eine Config in /etc/cni/net.d/ liegt** ist die richtige Antwort: Diese Condition heißt: Das Kubelet fand kein funktionierendes CNI — meist startete der CNI-Pod (DaemonSet) nicht (Taints, Image-Pull) oder schrieb keine Config. Ohne CNI laufen nur hostNetwork-Pods.
