## Question

Компания требует, чтобы весь egress-трафик из кластера к внешнему API исходил с фиксированного IP для allow-list в firewall. Какое решение применить?

## Options

- Увеличить pod CIDR
- Использовать hostPort у pods
- Изменить Service на ExternalName
- Настроить Egress Gateway

## Solution

**Настроить Egress Gateway** — правильный ответ: Egress gateways концентрируют исходящий трафик на определённых узлах/IP. В Cilium `CiliumEgressGatewayPolicy` выполняет SNAT на egressIP gateway-узла; в Istio трафик выходит через egress gateway mesh. Без этого исходящий IP зависит от узла, где работает pod.
