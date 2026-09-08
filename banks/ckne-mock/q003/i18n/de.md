## Question

Sie müssen den Traffic eines bestimmten Pods direkt auf dem Node mitschneiden, ohne den Pod zu betreten. Was ist der richtige Ansatz?

## Options

- tcpdump -i eth0 auf dem Node, da aller Pod-Traffic unverändert über eth0 läuft
- Unmöglich; tcpdump funktioniert nur im Pod
- Das veth-Interface des Pods auf dem Host identifizieren und tcpdump -i vethXXXX ausführen
- tcpdump -i lo, da Pods das Host-Loopback nutzen

## Solution

**Das veth-Interface des Pods auf dem Host identifizieren und tcpdump -i vethXXXX ausführen** ist die richtige Antwort: Jeder Pod hat ein veth-Paar: ein Ende im Pod-Netns (eth0), das andere auf dem Host (vethXXXX). Das Paar über die Interface-Indizes finden und mit `tcpdump -i vethXXXX` mitschneiden. Alternative: `nsenter -t <PID> -n tcpdump`.
