## Question

¿Qué intenta optimizar Topology Aware Routing (topology hints, por ejemplo service.kubernetes.io/topology-mode: Auto) y cuál es la contrapartida?

## Options

- Cifrar todo el tráfico; la contrapartida es el uso de CPU
- Mantener el tráfico dentro de la misma zona de disponibilidad
- Reducir consultas DNS; la contrapartida es la caché
- Aumentar las réplicas; la contrapartida es la memoria

## Solution

**Mantener el tráfico dentro de la misma zona de disponibilidad** es la respuesta correcta: Con hints, cada kube-proxy prefiere endpoints de la misma zona, reduciendo costes de tráfico cross-AZ y latencia. Si una zona tiene muy pocos endpoints para su cuota de tráfico, puede producirse sobrecarga local; el mecanismo desactiva hints cuando la distribución es muy asimétrica.
