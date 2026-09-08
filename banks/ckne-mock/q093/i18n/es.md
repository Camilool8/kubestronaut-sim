## Question

En la API MCS, ¿cuál es la diferencia entre un ServiceImport de tipo ClusterSetIP y uno de tipo Headless?

## Options

- ClusterSetIP proporciona un único VIP que balancea entre clusters
- No existe ninguna diferencia
- ClusterSetIP solo funciona con IPv4 y Headless solo con IPv6
- Headless siempre es más rápido que ClusterSetIP

## Solution

**ClusterSetIP proporciona un único VIP que balancea entre clusters** es la respuesta correcta: Refleja el comportamiento de un solo cluster: `ClusterSetIP` ofrece un VIP para consumo balanceado; `Headless` expone cada backend mediante sus propios registros, necesario cuando el cliente debe comunicarse con instancias específicas entre clusters.
