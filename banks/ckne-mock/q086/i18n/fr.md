## Question

Dans la Gateway API Inference Extension, quel est le rôle de la ressource InferenceModel (ou InferenceObjective) ?

## Options

- Entraîner le modèle dans le cluster
- Mapper le nom du modèle vers un InferencePool, avec criticality
- Définir combien de GPU chaque nœud expose au scheduler
- Remplacer le Deployment du serveur de modèle

## Solution

**Mapper le nom du modèle vers un InferencePool, avec criticality** est la bonne réponse : `InferenceModel` associe le nom logique du modèle (ce que demande le client) à l'`InferencePool` qui le sert, définit la criticality (priorisation/shedding sous charge) et permet le canary entre versions/adaptateurs du modèle.
