## Question

Pendant un rollout, les nouveaux pods entrent ready dans l'EndpointSlice et reçoivent IMMÉDIATEMENT du trafic, mais renvoient des 502 pendant ~3 s. La readinessProbe passe. Où est le piège ?

## Options

- La probe valide quelque chose de superficiel avant que l'app soit prête
- kube-proxy est toujours trop lent
- Les EndpointSlices ont un délai obligatoire de 3 s
- Les 502 sont normaux en rollout

## Solution

**La probe valide quelque chose de superficiel avant que l'app soit prête** est la bonne réponse : La « Pod Endpoint Availability » dépend de l'HONNÊTETÉ de la probe : un check TCP passe avec un socket ouvert et une app froide (warm-up, connexions DB). Les endpoints entrent au balancing dès qu'ils sont ready — la probe est le contrat (un /ready qui vérifie les dépendances).
