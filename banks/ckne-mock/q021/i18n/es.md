## Question

kubectl get svc muestra el Service, pero `kubectl get endpointslices -l kubernetes.io/service-name=my-svc` no devuelve endpoints. ¿Cuál es la causa más común?

## Options

- El ClusterIP está siendo utilizado por otro Service
- CoreDNS necesita reiniciarse
- El selector del Service no coincide con las labels de los pods
- Al Service le falta la annotation de endpoints

## Solution

**El selector del Service no coincide con las labels de los pods** es la respuesta correcta: Un Service sin endpoints casi siempre indica una discrepancia entre `spec.selector` y las labels de los pods, pods en otro namespace o ningún pod ready. Compare con `kubectl get pods --show-labels`.
