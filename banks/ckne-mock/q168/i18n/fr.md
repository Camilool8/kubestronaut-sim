## Question

Il vous faut une baseline de bande passante et latence pod-à-pod entre deux nœuds précis avant d'accuser le réseau de la lenteur applicative. Méthode directe ?

## Options

- kubectl top nodes en heure de pointe
- Augmenter les répliques du service et regarder les graphes
- iperf3 entre des pods des deux nœuds, comparé au cas même-nœud
- Lire la documentation de capacité du datacenter

## Solution

**iperf3 entre des pods des deux nœuds, comparé au cas même-nœud** est la bonne réponse : Sans baseline, tout débat est opinion. La paire iperf3 mesure le plafond réel du datapath (y compris l'overhead d'encapsulation/chiffrement) ; la comparaison même-nœud vs inter-nœuds isole où vit la dégradation. Latence/pertes : mtr/ping.
