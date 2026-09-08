## Question

Pods hängen in ContainerCreating mit "failed to allocate for range 0: no IP addresses available in range". Diagnose und Fix?

## Options

- Das Cluster-DNS ist down
- Der IPAM-Pool des Nodes ist erschöpft
- Das Kubelet hat keinen Speicher mehr
- Der Apiserver drosselt Requests

## Solution

**Der IPAM-Pool des Nodes ist erschöpft** ist die richtige Antwort: Jeder Node hat einen endlichen Bereich (Standard-/24-podCIDR ≈ 254 IPs vs. max-pods 110). Crashes hinterlassen verwaiste Leases im IPAM-State (z. B. `/var/lib/cni/networks/<net>`). IP-Dateien ohne zugehörigen Container löschen oder den Bereich vergrößern.
