## Question

Qual comando tcpdump captura apenas o tráfego DNS de um pod com IP 10.0.1.5, em qualquer interface do nó?

## Options

- tcpdump -i lo udp port 53 -c 100
- tcpdump -i any -n port 53 and host 10.0.1.5
- tcpdump -n tcp port 80 and host 10.0.1.5
- tcpdump -i eth0 icmp and host 10.0.1.5

## Solution

**tcpdump -i any -n port 53 and host 10.0.1.5** é a resposta correta: `-i any` cobre todas as interfaces (útil quando não se sabe o veth), `port 53` filtra DNS (UDP e TCP) e `host 10.0.1.5` restringe ao pod. Adicione `-vvv` para ver os nomes consultados e os rcodes das respostas.
