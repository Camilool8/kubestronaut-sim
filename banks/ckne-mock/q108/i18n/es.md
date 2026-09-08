## Question

¿Cómo verifica que el cifrado WireGuard de Cilium está realmente activo y cifrando el tráfico entre nodos?

## Options

- cilium status | grep Encryption
- kubectl get secrets
- Hacer ping entre los pods
- Observar los colores de los pods en el dashboard

## Solution

**cilium status | grep Encryption** es la respuesta correcta: Validación en tres capas: el agent informa del modo, `wg show` confirma peers con handshakes recientes y una captura en la NIC física debe mostrar únicamente paquetes WireGuard (UDP 51871), no el payload en claro entre IP de pods.
