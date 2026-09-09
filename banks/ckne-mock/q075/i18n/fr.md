## Question

À quoi sert publishNotReadyAddresses: true sur un Service ?

## Options

- Inclure aussi les pods NOT-ready dans DNS/endpoints
- Ignorer la livenessProbe
- Publier le Service sur Internet via LoadBalancer
- Dupliquer les endpoints

## Solution

**Inclure aussi les pods NOT-ready dans DNS/endpoints** est la bonne réponse : Normalement, seuls les pods prêts entrent dans DNS/endpoints — mais un cluster etcd/Cassandra en formation doit résoudre ses membres AVANT qu'ils soient prêts (œuf et poule). Ce champ, courant sur les headless Services de StatefulSets, résout cela.
