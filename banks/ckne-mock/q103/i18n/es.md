## Question

¿Cuál es la forma estandarizada de permitir tráfico desde un namespace específico POR NOMBRE (por ejemplo, "monitoring") en una NetworkPolicy?

## Options

- ipBlock con el CIDR del namespace
- Escribir el nombre literal en un campo from.namespace
- namespaceSelector con la label kubernetes.io/metadata.name
- No es posible seleccionar por nombre

## Solution

**namespaceSelector con la label kubernetes.io/metadata.name** es la respuesta correcta: Cada namespace recibe automáticamente la label inmutable `kubernetes.io/metadata.name`. Utilizarla en namespaceSelector permite referenciar namespaces por nombre sin depender de labels manuales.
