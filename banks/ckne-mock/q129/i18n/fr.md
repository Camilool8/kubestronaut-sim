## Question

Vous pinguez le ClusterIP d'un Service sans réponse, mais curl sur le port du Service marche parfaitement. Pourquoi ?

## Options

- L'ICMP exige NodePort
- Le Service est cassé et curl utilise un cache
- Les VIPs sont des règles DNAT, sans interface répondant à l'ICMP
- Le pare-feu bloque curl

## Solution

**Les VIPs sont des règles DNAT, sans interface répondant à l'ICMP** est la bonne réponse : Piège du dépannage : le VIP n'est attaché à aucune interface ; iptables/IPVS/eBPF ne traduisent que `VIP:port`. Testez les Services avec `nc -zv`/`curl`, jamais avec ping.
