## Question

Was ist in einer from-Regel der Unterschied zwischen namespaceSelector: {} und dem Weglassen des namespaceSelectors?

## Options

- namespaceSelector: {} (leer) matcht ALLE Namespaces des Clusters
- Der leere Selector matcht keinen Namespace (leere Menge)
- Der leere Selector ist ungültige Syntax und wird bei der Admission abgelehnt
- Kein Unterschied

## Solution

**namespaceSelector: {} (leer) matcht ALLE Namespaces des Clusters** ist die richtige Antwort: Bei Kubernetes-Selektoren gilt: leer = alles selektieren. `namespaceSelector: {}` öffnet für den ganzen Cluster; nur podSelector (ohne namespaceSelector) beschränkt auf den eigenen Namespace — das Gegenteil der "leer = nichts"-Intuition. Eine der meistgeprüften Fallen.
