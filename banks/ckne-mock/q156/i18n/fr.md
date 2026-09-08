## Question

Un pod avec hostNetwork: true atteint des pods protégés par une NetworkPolicy n'autorisant que certains podSelectors — et l'accès FONCTIONNE. Pourquoi ?

## Options

- hostNetwork active un mode réseau administratif
- Les NetworkPolicies ont un bug connu avec le TCP keepalive
- La policy ne couvre que TCP, et l'accès utilise UDP
- Son trafic provient de l'IP du NŒUD, pas d'une identité de pod

## Solution

**Son trafic provient de l'IP du NŒUD, pas d'une identité de pod** est la bonne réponse : Les pods hostNetwork « sont le nœud » pour le réseau. Beaucoup de CNI traitent les IPs de nœuds spécialement (les probes du kubelet doivent passer) — les policies par identité de pod ne les restreignent pas comme prévu. Prudence avec ce qui tourne en hostNetwork.
