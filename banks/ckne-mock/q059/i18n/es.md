## Question

¿Qué comando tcpdump captura únicamente el tráfico DNS de un pod con IP 10.0.1.5 en cualquier interfaz del nodo?

## Options

- tcpdump -i lo udp port 53 -c 100
- tcpdump -i any -n port 53 and host 10.0.1.5
- tcpdump -n tcp port 80 and host 10.0.1.5
- tcpdump -i eth0 icmp and host 10.0.1.5

## Solution

**tcpdump -i any -n port 53 and host 10.0.1.5** es la respuesta correcta: `-i any` cubre todas las interfaces (útil cuando no conoce la veth), `port 53` filtra DNS (UDP y TCP) y `host 10.0.1.5` limita la captura al pod. Añada `-vvv` para ver los nombres consultados y los rcodes de las respuestas.
