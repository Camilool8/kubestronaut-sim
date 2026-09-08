## Question

kubectl get svc montre le Service, mais `kubectl get endpointslices -l kubernetes.io/service-name=my-svc` ne renvoie aucun endpoint. Cause la plus fréquente ?

## Options

- Le ClusterIP est utilisé par un autre Service
- CoreDNS a besoin d'un redémarrage
- Le selector du Service ne correspond pas aux labels des pods
- Il manque l'annotation endpoints sur le Service

## Solution

**Le selector du Service ne correspond pas aux labels des pods** est la bonne réponse : Un Service sans endpoints signifie presque toujours un décalage entre `spec.selector` et les labels des pods — ou des pods dans un autre namespace, ou aucun prêt. Comparez avec `kubectl get pods --show-labels`.
