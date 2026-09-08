## Question

En una topología multi-cluster de Istio con redes distintas y sin conectividad directa pod-a-pod, ¿qué componente permite que el tráfico de servicios cruce entre clusters?

## Options

- Un NodePort por servicio abierto en todos los clusters
- Un east-west gateway dedicado expone servicios entre clusters mediante mTLS
- kubectl port-forward permanente
- VPN en los portátiles de los desarrolladores

## Solution

**Un east-west gateway dedicado expone servicios entre clusters mediante mTLS** es la respuesta correcta: Cuando los pods de clusters diferentes no pueden alcanzarse directamente, Istio enruta el tráfico entre clusters mediante east-west gateways (un LoadBalancer dedicado), manteniendo mTLS y el descubrimiento unificado de endpoints entre redes.
