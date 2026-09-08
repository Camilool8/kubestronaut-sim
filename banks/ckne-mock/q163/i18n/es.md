## Question

Las aplicaciones informan de timeouts DNS intermitentes de EXACTAMENTE 5 segundos bajo carga. ¿Cuál es la causa clásica y la mitigación?

## Options

- Un cable de red defectuoso en uno de los nodos
- CoreDNS es lento bajo cualquier carga
- TTL cero en los registros devueltos por el upstream
- Una condición de carrera de conntrack con consultas UDP paralelas

## Solution

**Una condición de carrera de conntrack con consultas UDP paralelas** es la respuesta correcta: Los "5 segundos malditos": drops provocados por una carrera de inserción en conntrack con UDP. NodeLocal DNSCache elimina NAT de la ruta y utiliza TCP hacia el upstream; es la corrección estructural más recomendada.
