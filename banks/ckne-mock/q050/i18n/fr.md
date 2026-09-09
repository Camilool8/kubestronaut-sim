## Question

Pour auditer QUEL trafic réseau a réellement circulé (ou été bloqué) entre workloads, quelle est la bonne source de données ?

## Options

- Les logs du kube-scheduler
- Les flow logs du datapath (Hubble, Calico, VPC Flow Logs)
- kubectl get events
- Le journal d'audit du kube-apiserver au niveau RequestResponse

## Solution

**Les flow logs du datapath (Hubble, Calico, VPC Flow Logs)** est la bonne réponse : Confusion fréquente : les audit logs de l'apiserver tracent les opérations API. Pour le trafic réseau, utilisez les flow logs CNI/datapath — source, destination, port, verdict, policy — exportables vers un SIEM.
