## Question

Welchen DNS-Record erzeugt Kubernetes für einen einzelnen POD (ohne Service), und in welchem Format?

## Options

- pod-name.cluster.local
- Die IP mit Bindestrichen: 10-244-1-5.default.pod.cluster.local
- pods.default.svc
- Für Pods wird nie ein Record erzeugt

## Solution

**Die IP mit Bindestrichen: 10-244-1-5.default.pod.cluster.local** ist die richtige Antwort: Das Format `a-b-c-d.ns.pod.cluster.local` existiert, enthält aber die IP selbst — nutzlos zur Pod-Discovery, nur eine Bequemlichkeit für Zertifikate/URLs. Stabile Pod-Discovery = Headless Service (StatefulSet).
