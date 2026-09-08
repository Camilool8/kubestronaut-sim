## Question

Selon la spécification CNI, que fait la runtime de conteneurs quand un pod est créé ?

## Options

- Elle envoie un CRD NetworkRequest à l'apiserver
- Elle écrit directement dans les tables de routage du netns du pod
- Elle appelle l'API REST du plugin CNI en HTTPS
- Elle exécute le binaire du plugin avec CNI_COMMAND=ADD, config via stdin

## Solution

**Elle exécute le binaire du plugin avec CNI_COMMAND=ADD, config via stdin** est la bonne réponse : CNI est un contrat d'exécution de binaire : la runtime lance le plugin avec des variables comme `CNI_COMMAND=ADD`, `CNI_NETNS`, `CNI_IFNAME` et la config JSON via stdin. Le plugin renvoie du JSON avec IPs/routes. DEL est appelé à la suppression.
