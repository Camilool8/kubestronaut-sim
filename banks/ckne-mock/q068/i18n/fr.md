## Question

Pourquoi `ip netns list` sur le nœud est-il souvent vide malgré des dizaines de pods, et quelle commande liste les vrais namespaces réseau ?

## Options

- Parce que la commande est dépréciée
- Les runtimes ne créent pas de netns nommés ; utilisez lsns -t net
- Parce qu'il faut être root et sudo deux fois
- Parce que les pods n'utilisent pas de namespaces

## Solution

**Les runtimes ne créent pas de netns nommés ; utilisez lsns -t net** est la bonne réponse : `ip netns` ne voit que les netns nommés (bind-montés dans /var/run/netns). Les runtimes (containerd/CRI-O) créent des netns anonymes par processus ; `lsns -t net` les liste avec les PIDs — puis `nsenter -t PID -n` pour inspecter.
