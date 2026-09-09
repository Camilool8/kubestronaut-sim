## Question

В режиме iptables у kube-proxy какая chain является точкой входа, где перехватывается трафик, направленный к Services?

## Options

- KUBE-NODEPORTS
- KUBE-SERVICES
- CNI-ISOLATION
- KUBE-FORWARD

## Solution

**KUBE-SERVICES** — правильный ответ: Chain `KUBE-SERVICES`, вызываемая из PREROUTING/OUTPUT таблицы nat, содержит правило для каждого Service и переходит в chains `KUBE-SVC-*`, которые балансируют трафик между chains `KUBE-SEP-*` — endpoints, где выполняется DNAT. Для диагностики используйте `iptables -t nat -L KUBE-SERVICES`.
