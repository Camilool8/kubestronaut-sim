## Question

Un client à fort débit vers la même destination échoue avec « cannot assign requested address » ; `ss -s` dans le pod montre des dizaines de milliers de connexions TIME_WAIT. Le problème ?

## Options

- Le kernel du nœud est corrompu
- La MTU est trop basse sur le chemin
- Le DNS manque dans le namespace du pod
- Épuisement des ports éphémères par accumulation de TIME_WAIT

## Solution

**Épuisement des ports éphémères par accumulation de TIME_WAIT** est la bonne réponse : Le motif « ouvrir-fermer par requête » tue le client avant le serveur : ~28k ports éphémères ÷ 60 s de TIME_WAIT ≈ plafond d'~470 nouvelles connexions/s par destination. Le pooling/keep-alive règle cela dans l'architecture, pas dans le sysctl (tcp_tw_reuse seulement où applicable).
