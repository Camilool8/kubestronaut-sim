## Question

¿Por qué la latencia p99 de un histograma suele revelar más que la media al diagnosticar problemas de red?

## Options

- p99 utiliza menos memoria
- La media es imposible de calcular en Prometheus
- No existe una diferencia práctica
- La media oculta la cola: p99 expone el peor 1 % de las solicitudes

## Solution

**La media oculta la cola: p99 expone el peor 1 % de las solicitudes** es la respuesta correcta: Los problemas de red suelen aparecer en la cola (retransmisiones, colas, conntrack). Con `histogram_quantile(0.99, rate(..._bucket[5m]))` se observa el peor 1 %, que es lo que realmente perciben los usuarios.
