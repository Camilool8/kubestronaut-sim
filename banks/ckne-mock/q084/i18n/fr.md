## Question

Qu'arrive-t-il aux nouvelles connexions vers un ClusterIP dont le Service n'a AUCUN endpoint prêt ?

## Options

- Elles sont redirigées vers l'apiserver
- Rejetées immédiatement (REJECT → « connection refused »)
- Elles font la queue dans le kernel jusqu'à ce qu'un pod monte
- Elles reçoivent un HTTP 404 généré par kube-proxy

## Solution

**Rejetées immédiatement (REJECT → « connection refused »)** est la bonne réponse : kube-proxy installe une règle reject pour les Services sans endpoints — le client obtient immédiatement « connection refused ». Distinguer refused (pas d'endpoints/mauvais port) de timeout (policy/route/pare-feu) accélère énormément le dépannage.
