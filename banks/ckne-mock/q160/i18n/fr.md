## Question

Avec PeerAuthentication en mode PERMISSIVE (défaut), le dashboard montre « mTLS: enabled » et l'audit passe. Quel est le risque caché ?

## Options

- PERMISSIVE ne chiffre que la moitié des paquets
- STRICT casse le TLS
- Aucun, PERMISSIVE est sûr
- PERMISSIVE accepte AUSSI le texte en clair

## Solution

**PERMISSIVE accepte AUSSI le texte en clair** est la bonne réponse : Piège d'audit : PERMISSIVE existe pour la migration (accepte mTLS ET clair) — tout client sans sidecar entre en clair ; « enabled » ne veut pas dire « enforced ». Testez avec une connexion sans sidecar et fermez avec STRICT par namespace.
