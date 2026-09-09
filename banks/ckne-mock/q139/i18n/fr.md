## Question

En débogage, `kubectl port-forward svc/my-api 8080:80` fonctionne, mais en production les pods échouent sur le même Service. Pourquoi port-forward ne valide-t-il PAS le vrai chemin ?

## Options

- Tunnel direct vers UN pod via l'apiserver, hors du chemin du Service
- La production utilise toujours un autre cluster et une autre image
- port-forward utilise UDP
- port-forward est plus lent

## Solution

**Tunnel direct vers UN pod via l'apiserver, hors du chemin du Service** est la bonne réponse : Le tunnel passe par apiserver/kubelet en contournant kube-proxy, ClusterIP, DNS et NetworkPolicies. Il peut marcher avec un DNS cassé, des policies bloquantes et un kube-proxy mort. Pour valider le vrai chemin, testez depuis L'INTÉRIEUR d'un pod.
