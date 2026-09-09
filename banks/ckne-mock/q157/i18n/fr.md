## Question

Une policy INGRESS autorise le trafic vers le pod sur 8080, mais AUCUNE policy egress n'autorise les réponses. Les connexions marchent-elles ?

## Options

- Seulement 30 secondes
- Non, la réponse doit être autorisée en egress
- Oui : l'enforcement est stateful
- Seulement en UDP

## Solution

**Oui : l'enforcement est stateful** est la bonne réponse : Les NetworkPolicies opèrent sur des connexions (conntrack), pas paquet par paquet : autoriser la direction initiatrice suffit — les paquets de RÉPONSE d'une connexion autorisée passent automatiquement. Les confondre avec des ACL stateless mène à des policies « réponse » redondantes.
