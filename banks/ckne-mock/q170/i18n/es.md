## Question

hubble observe muestra drops con veredicto "Policy denied" en la dirección pod→kube-dns DESPUÉS de aplicar una policy de egress al namespace. Las aplicaciones se quejan de que no resuelven nombres. ¿Cuál es la interpretación correcta del flujo?

## Options

- kube-dns cambió de puertos
- El flow log confirma la causa raíz
- CoreDNS se cayó y eliminó la resolución
- Hubble se equivoca para este tipo de flujo

## Solution

**El flow log confirma la causa raíz** es la respuesta correcta: Flujos DROPPED dirigidos a kube-dns:53 justo después de aplicar una policy de egress son la firma inequívoca de la regla DNS olvidada. Hubble convierte "DNS dejó de funcionar misteriosamente" en una relación visible de causa y efecto.
