## Question

Eine HTTPRoute braucht backendRefs auf einen Service in einem ANDEREN Namespace. Was ist erforderlich?

## Options

- Den Service als NodePort neu anlegen
- Ein ReferenceGrant im Namespace des Service, der die Route autorisiert
- Nichts, Cross-Namespace-Referenzen sind standardmäßig erlaubt
- Das Gateway nach kube-system verschieben

## Solution

**Ein ReferenceGrant im Namespace des Service, der die Route autorisiert** ist die richtige Antwort: Cross-Namespace-Referenzen sind per Default verboten (Schutz vor Traffic-"Hijacking"). Der Besitzer des Ziel-Namespace veröffentlicht einen `ReferenceGrant` mit from (Kind/Namespace) und to (Kind/Name) — erst dann löst die Route auf.
