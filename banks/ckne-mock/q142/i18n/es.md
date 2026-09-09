## Question

¿Qué registro DNS crea Kubernetes para un POD individual (sin Service) y cuál es el formato?

## Options

- pod-name.cluster.local
- La IP con guiones: 10-244-1-5.default.pod.cluster.local
- pods.default.svc
- Nunca se crea ningún registro para pods

## Solution

**La IP con guiones: 10-244-1-5.default.pod.cluster.local** es la respuesta correcta: Existe el formato `a-b-c-d.ns.pod.cluster.local`, pero incorpora la propia IP, por lo que no sirve para descubrir pods. Descubrimiento estable de pods = Service headless (StatefulSet).
