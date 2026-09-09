## Question

Qu'est-ce que le routage « LoRA-aware » dans les gateways d'inférence ?

## Options

- N'utiliser que des GPU NVIDIA
- Envoyer vers les répliques qui ont déjà l'adaptateur LoRA chargé
- Compresser les réponses
- Balancer par hash du prompt sur toutes les répliques

## Solution

**Envoyer vers les répliques qui ont déjà l'adaptateur LoRA chargé** est la bonne réponse : Des serveurs comme vLLM exposent quels adaptateurs LoRA sont chargés. L'Endpoint Picker privilégie les répliques avec l'adaptateur « chaud » — un swap d'adaptateur coûte du temps GPU et dégrade la latence de toute la file.
