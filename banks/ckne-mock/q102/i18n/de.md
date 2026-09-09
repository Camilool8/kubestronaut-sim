## Question

Kann eine im Namespace "prod" erstellte NetworkPolicy Pods im Namespace "dev" selektieren und isolieren?

## Options

- Nur wenn das CNI Calico ist
- Ja, mit der cross-namespace-Annotation
- Nein: NetworkPolicy ist namespaced
- Ja, mit namespaceSelector

## Solution

**Nein: NetworkPolicy ist namespaced** ist die richtige Antwort: Der `spec.podSelector` selektiert Ziele NUR im Namespace der Policy. Der `namespaceSelector` erscheint nur in from/to-Regeln (erlaubte Quellen/Ziele), nie zur Wahl der Isolierten. Für Cluster-Scope: AdminNetworkPolicy oder CNI-CRDs.
