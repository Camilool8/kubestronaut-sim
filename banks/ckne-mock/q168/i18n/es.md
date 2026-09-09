## Question

Necesita una baseline de ancho de banda y latencia pod-a-pod entre dos nodos específicos antes de culpar a la red por la lentitud de la aplicación. ¿Qué método directo utiliza?

## Options

- kubectl top nodes durante las horas pico
- Añadir réplicas del servicio y observar los gráficos
- iperf3 entre pods de los dos nodos, comparado con el caso del mismo nodo
- Leer la documentación de capacidad del datacenter

## Solution

**iperf3 entre pods de los dos nodos, comparado con el caso del mismo nodo** es la respuesta correcta: Sin baseline, todo debate es una opinión. El par iperf3 mide el límite real del datapath, incluido el overhead de encapsulación/cifrado; comparar mismo nodo frente a nodos distintos aísla dónde se encuentra la degradación.
