## Question

¿Cómo registra TODAS las consultas DNS que recibe CoreDNS para una auditoría o depuración temporal?

## Options

- Añadir el plugin log al bloque del Corefile
- Ejecutar tcpdump permanente en todos los nodos
- Habilitar audit en kube-apiserver
- No es posible registrar consultas DNS

## Solution

**Añadir el plugin log al bloque del Corefile** es la respuesta correcta: El plugin `log` imprime cada consulta (nombre, tipo, rcode, duración) en stdout de CoreDNS. Debido al volumen, utilícelo temporalmente o con alcance limitado (por ejemplo, `log example.com`). Para auditoría continua por pod, prefiera métricas/flujos DNS de Hubble.
