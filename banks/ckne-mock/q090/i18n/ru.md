## Question

Каковы три ключевых элемента CiliumEgressGatewayPolicy?

## Options

- selectors, destinationCIDRs и egressGateway с egressIP
- name, namespace, labels и annotations ресурса
- port, targetPort и nodePort
- ingress, egress и policyTypes

## Solution

**selectors, destinationCIDRs и egressGateway с egressIP** — правильный ответ: Policy сопоставляет трафик — выбранные pods → destination CIDRs — и перенаправляет его на gateway-узел, который выполняет SNAT на настроенный `egressIP`, предоставляя фиксированный и аудируемый исходящий IP для внешних firewalls.
