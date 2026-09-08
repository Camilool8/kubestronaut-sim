## Question

Vous devez n'autoriser l'egress que vers api.github.com, dont les IPs changent constamment. Quelle solution native chez Cilium ?

## Options

- hostAliases sur le pod
- NetworkPolicy native avec un champ dns
- CiliumNetworkPolicy avec toFQDNs
- ipBlock avec toutes les plages GitHub maintenues à la main

## Solution

**CiliumNetworkPolicy avec toFQDNs** est la bonne réponse : La NetworkPolicy native ne prend que IPs/sélecteurs. Cilium intercepte le DNS (DNS proxy), apprend les IPs résolues pour le FQDN autorisé (matchName/matchPattern) et les autorise dynamiquement — la policy suit le nom. Autorisez aussi l'egress DNS avec des règles toPorts 53.
