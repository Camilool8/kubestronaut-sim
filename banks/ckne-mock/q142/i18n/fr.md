## Question

Quel enregistrement DNS Kubernetes crée-t-il pour un POD individuel (sans Service), et sous quel format ?

## Options

- pod-name.cluster.local
- L'IP avec des tirets : 10-244-1-5.default.pod.cluster.local
- pods.default.svc
- Aucun enregistrement n'est jamais créé pour les pods

## Solution

**L'IP avec des tirets : 10-244-1-5.default.pod.cluster.local** est la bonne réponse : Le format `a-b-c-d.ns.pod.cluster.local` existe, mais il encode l'IP elle-même — inutile pour découvrir des pods, juste une commodité pour certificats/URLs. La découverte stable de pods = Service headless (StatefulSet).
