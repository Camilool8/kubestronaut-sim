## Question

`dig app.default.svc.cluster.local` marche dans le pod, mais `dig app` échoue. Que vérifier en premier ?

## Options

- La version du kernel du nœud
- Les entrées search et ndots du /etc/resolv.conf du pod
- Si le pod a hostNetwork activé dans son spec
- Si kube-proxy est en mode IPVS ou iptables

## Solution

**Les entrées search et ndots du /etc/resolv.conf du pod** est la bonne réponse : Les noms courts dépendent des domaines `search` (ex. `default.svc.cluster.local svc.cluster.local`) et de `ndots:5`. Si dnsPolicy/dnsConfig a été modifié, ou si le pod est dans un autre namespace, le nom court ne s'étend pas vers le bon FQDN.
