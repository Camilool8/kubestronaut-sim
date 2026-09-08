## Question

Welcher tcpdump-Befehl erfasst nur den DNS-Traffic eines Pods mit IP 10.0.1.5, auf jedem Node-Interface?

## Options

- tcpdump -i lo udp port 53 -c 100
- tcpdump -i any -n port 53 and host 10.0.1.5
- tcpdump -n tcp port 80 and host 10.0.1.5
- tcpdump -i eth0 icmp and host 10.0.1.5

## Solution

**tcpdump -i any -n port 53 and host 10.0.1.5** ist die richtige Antwort: `-i any` deckt alle Interfaces ab (nützlich, wenn das veth unbekannt ist), `port 53` filtert DNS (UDP und TCP), `host 10.0.1.5` grenzt auf den Pod ein. Mit `-vvv` sieht man Namen und rcodes.
