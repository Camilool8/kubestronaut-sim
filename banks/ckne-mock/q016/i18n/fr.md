## Question

Un pod est Running mais ne reçoit pas de trafic du Service. `kubectl get endpointslices` montre l'endpoint avec ready: false. Cause la plus probable ?

## Options

- CoreDNS crashe en boucle
- kube-proxy n'accepte que les pods déclarés ready: true dans le manifeste
- La readinessProbe du pod échoue, le retirant du balancing
- Le ClusterIP a expiré

## Solution

**La readinessProbe du pod échoue, le retirant du balancing** est la bonne réponse : La `readinessProbe` contrôle la disponibilité de l'endpoint : tant qu'elle échoue, le pod reste not-ready dans l'EndpointSlice et ne reçoit pas de trafic. C'est le cœur de la « Pod Endpoint Availability ». Vérifiez les events avec `kubectl describe pod`.
