## Question

Se aplicó una NetworkPolicy default-deny de egress y los pods dejaron de resolver DNS. ¿Qué regla mínima restaura la resolución de nombres?

## Options

- Permitir ingress en el puerto 443
- Volver a crear el Service kube-dns
- Permitir egress hacia los pods de kube-dns
- Mover CoreDNS a hostNetwork

## Solution

**Permitir egress hacia los pods de kube-dns** es la respuesta correcta: Con deny-all de egress, incluso las consultas a CoreDNS quedan bloqueadas; el síntoma clásico es `could not resolve host` para todo. Permita UDP y TCP 53 (TCP se utiliza para respuestas grandes o truncadas).
