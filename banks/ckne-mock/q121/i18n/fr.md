## Question

Le trafic d'un pod est jeté quelque part dans la pile kernel, sans savoir où (iptables ? tc ? route ?). Quel outil eBPF trace le chemin du paquet dans le kernel en montrant OÙ il est jeté ?

## Options

- un kubectl describe pod détaillé
- df -h
- top
- pwru (packet, where are you?)

## Solution

**pwru (packet, where are you?)** est la bonne réponse : `pwru` (de Cilium) instrumente le kernel avec eBPF et imprime le trajet du paquet fonction par fonction (hooks netfilter, routes, tc), y compris le point/raison du drop — résout les cas où tcpdump voit le paquet entrer mais jamais sortir.
