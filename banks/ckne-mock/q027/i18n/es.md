## Question

¿Qué hace un Service ExternalName?

## Options

- Crea un NodePort con un nombre personalizado
- Necesita un LoadBalancer aprovisionado por el cloud para funcionar
- Devuelve un CNAME hacia un nombre DNS externo, sin proxy ni endpoints
- Asigna una IP externa fija al pod

## Solution

**Devuelve un CNAME hacia un nombre DNS externo, sin proxy ni endpoints** es la respuesta correcta: `ExternalName` es puramente DNS: las consultas devuelven un CNAME hacia `spec.externalName`. No hay VIP, kube-proxy ni balanceo; resulta útil para abstraer servicios externos mediante nombres internos.
