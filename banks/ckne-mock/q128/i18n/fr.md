## Question

Deux conteneurs du MÊME pod tentent d'écouter sur le port 8080. Que se passe-t-il ?

## Options

- Ça marche : chaque conteneur a son propre netns
- Le kubelet crée une deuxième IP
- Le trafic est balancé entre eux
- Le second échoue avec « address already in use »

## Solution

**Le second échoue avec « address already in use »** est la bonne réponse : Le netns appartient à la sandbox (conteneur pause) ; tous les conteneurs du pod le partagent — c'est pourquoi localhost fonctionne entre eux et les ports entrent en collision.
