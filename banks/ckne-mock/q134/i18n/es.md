## Question

¿Por qué --cluster-cidr (pods) y --service-cluster-ip-range NUNCA deben superponerse?

## Options

- Porque DNS exige rangos iguales
- Porque los ClusterIP son virtuales
- Pueden superponerse sin problemas
- Por estética de configuración

## Solution

**Porque los ClusterIP son virtuales** es la respuesta correcta: Son planos de direccionamiento diferentes procesados por mecanismos distintos (rutas/CNI frente a reglas DNAT). La superposición produce el peor tipo de fallo: intermitente y dependiente del orden de las reglas.
