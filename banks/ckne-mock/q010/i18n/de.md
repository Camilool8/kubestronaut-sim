## Question

Welches Netzwerkverhalten zeigt ein Pod mit hostNetwork: true?

## Options

- Verliert externe Konnektivität
- Bekommt wie üblich eine IP aus dem Pod-CIDR
- Spricht nur mit Pods im selben Namespace
- Teilt den Netzwerk-Namespace des Nodes und nutzt dessen IP

## Solution

**Teilt den Netzwerk-Namespace des Nodes und nutzt dessen IP** ist die richtige Antwort: Mit `hostNetwork: true` hat der Pod kein eigenes Netns: Er nutzt IP und Interfaces des Nodes. Offene Ports konkurrieren mit Host-Prozessen (Kollisionsrisiko), und podSelector-basierte NetworkPolicies greifen meist nicht wie erwartet.
