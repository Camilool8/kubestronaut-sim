## Question

Para permitir tráfico desde el pod frontend (10.244.3.7), creó una regla ipBlock con 10.244.3.7/32. Funcionó hoy y dejó de funcionar mañana. ¿Por qué?

## Options

- ipBlock caduca en 24 h y debe renovarse
- Un CIDR /32 es inválido en reglas NetworkPolicy
- El frontend necesita hostNetwork para poder seleccionarse
- Las IP de pods son efímeras y pueden llegar con SNAT; utilice selectors

## Solution

**Las IP de pods son efímeras y pueden llegar con SNAT; utilice selectors** es la respuesta correcta: Las policies entre workloads deben utilizar identidad (labels), no direcciones. La propia documentación limita ipBlock a IP externas al cluster: existe un doble riesgo, rotación de IP y NAT en la ruta.
