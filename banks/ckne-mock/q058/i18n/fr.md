## Question

Quelle commande montre les entrées de connection tracking (NAT/état) pour voir où la connexion d'un pod est traduite ?

## Options

- free -m
- lsof -i
- systemctl status conntrack
- conntrack -L | grep `<pod-IP>`

## Solution

**conntrack -L | grep `<pod-IP>`** est la bonne réponse : `conntrack -L` liste la table de connection tracking du kernel : on voit le tuple original (pod→ClusterIP) et le traduit (pod→endpoint) après le DNAT de kube-proxy — essentiel pour confirmer que le NAT du Service opère.
