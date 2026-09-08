## Question

Quelle commande Hubble montre, en temps réel, uniquement les flux DROPPED et la raison (ex. Policy denied) ?

## Options

- hubble observe --verdict DROPPED
- kubectl logs cilium
- hubble encrypt --all --follow
- hubble delete flows --verdict ALL

## Solution

**hubble observe --verdict DROPPED** est la bonne réponse : `hubble observe --verdict DROPPED` liste chaque drop avec source→destination, port et raison (Policy denied, CT, unsupported L3…) ; ajoutez `-f` pour suivre, `--from-pod/--to-pod` pour filtrer. Le chemin le plus rapide vers la NetworkPolicy bloquante.
