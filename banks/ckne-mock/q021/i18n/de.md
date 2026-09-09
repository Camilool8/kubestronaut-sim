## Question

kubectl get svc zeigt den Service, aber `kubectl get endpointslices -l kubernetes.io/service-name=my-svc` liefert keine Endpoints. Häufigste Ursache?

## Options

- Der ClusterIP wird von einem anderen Service belegt
- CoreDNS braucht einen Neustart
- Der Selector des Service passt nicht zu den Pod-Labels
- Dem Service fehlt die endpoints-Annotation

## Solution

**Der Selector des Service passt nicht zu den Pod-Labels** ist die richtige Antwort: Ein Service ohne Endpoints heißt fast immer: Mismatch zwischen `spec.selector` und Pod-Labels — oder Pods in anderem Namespace bzw. keine ready. Vergleich mit `kubectl get pods --show-labels`.
