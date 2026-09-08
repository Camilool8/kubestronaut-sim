## Question

Con kube-proxy en modo iptables, ¿qué chain es el punto de entrada donde se intercepta el tráfico destinado a Services?

## Options

- KUBE-NODEPORTS
- KUBE-SERVICES
- CNI-ISOLATION
- KUBE-FORWARD

## Solution

**KUBE-SERVICES** es la respuesta correcta: La chain `KUBE-SERVICES` (llamada desde PREROUTING/OUTPUT en la tabla nat) contiene una regla por Service y salta a chains `KUBE-SVC-*` que balancean hacia chains `KUBE-SEP-*` (endpoints, donde ocurre el DNAT). Depure con `iptables -t nat -L KUBE-SERVICES`.
