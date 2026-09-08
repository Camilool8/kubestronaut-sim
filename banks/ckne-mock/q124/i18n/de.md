## Question

Welcher Hubble-Befehl zeigt in Echtzeit nur DROPPED-Flows samt Grund (z. B. Policy denied)?

## Options

- hubble observe --verdict DROPPED
- kubectl logs cilium
- hubble encrypt --all --follow
- hubble delete flows --verdict ALL

## Solution

**hubble observe --verdict DROPPED** ist die richtige Antwort: `hubble observe --verdict DROPPED` listet jeden Drop mit Quelle→Ziel, Port und Grund (Policy denied, CT, unsupported L3 …); mit `-f` folgen, mit `--from-pod/--to-pod` filtern. Der schnellste Weg zur blockierenden NetworkPolicy.
