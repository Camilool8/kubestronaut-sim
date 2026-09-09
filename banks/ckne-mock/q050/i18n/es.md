## Question

Para auditar QUÉ tráfico de red fluyó realmente (o fue bloqueado) entre workloads, ¿cuál es la fuente de datos correcta?

## Options

- Logs de kube-scheduler
- Flow logs del datapath (Hubble, Calico, VPC flow logs)
- kubectl get events
- Audit log de kube-apiserver en nivel RequestResponse

## Solution

**Flow logs del datapath (Hubble, Calico, VPC flow logs)** es la respuesta correcta: Confusión común: los audit logs de apiserver auditan operaciones de la API. Para tráfico de red, utilice flow logs del CNI/datapath —origen, destino, puerto, veredicto y policy— exportables a un SIEM.
