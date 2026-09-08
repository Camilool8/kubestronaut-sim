## Question

¿Para qué sirve publishNotReadyAddresses: true en un Service?

## Options

- Incluir también pods NOT ready en DNS/endpoints
- Ignorar la livenessProbe
- Publicar el Service en internet mediante LoadBalancer
- Duplicar los endpoints

## Solution

**Incluir también pods NOT ready en DNS/endpoints** es la respuesta correcta: Normalmente solo los pods ready se incorporan a DNS/endpoints, pero un cluster etcd/Cassandra que se está formando necesita que sus miembros puedan resolverse ANTES de estar ready (problema de chicken-and-egg). Este campo, común en Services headless de StatefulSet, lo resuelve.
