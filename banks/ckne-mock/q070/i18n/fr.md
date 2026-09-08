## Question

À quoi sert NodeLocal DNSCache ?

## Options

- Bloquer les requêtes externes
- Un cache DNS sur chaque nœud
- Remplacer CoreDNS
- Ne servir que des PTR

## Solution

**Un cache DNS sur chaque nœud** est la bonne réponse : NodeLocal DNSCache (DaemonSet) intercepte les requêtes sur le nœud même via une IP link-local (ex. 169.254.20.10), répond depuis le cache et remonte en TCP vers CoreDNS — réduisant latence, charge CoreDNS et les fameuses races conntrack avec le DNS/UDP.
