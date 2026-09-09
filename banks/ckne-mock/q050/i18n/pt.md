## Question

Para auditar QUAL tráfego de rede realmente fluiu (ou foi bloqueado) entre workloads, qual fonte de dados é a correta?

## Options

- Logs do kube-scheduler
- Flow logs do datapath (Hubble, Calico, VPC flow logs)
- kubectl get events
- Audit log do kube-apiserver em nível RequestResponse

## Solution

**Flow logs do datapath (Hubble, Calico, VPC flow logs)** é a resposta correta: Confusão comum: audit logs do apiserver auditam operações na API. Para tráfego de rede, use flow logs do CNI/datapath — origem, destino, porta, veredito, policy — exportáveis a SIEM.
