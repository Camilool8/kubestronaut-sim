## Question

Sie pingen den ClusterIP eines Service ohne Antwort, aber curl auf den Service-Port funktioniert perfekt. Warum?

## Options

- ICMP verlangt NodePort
- Der Service ist kaputt und curl nutzt einen Cache
- VIPs sind DNAT-Regeln, ohne Interface, das ICMP beantwortet
- Die Firewall blockiert curl

## Solution

**VIPs sind DNAT-Regeln, ohne Interface, das ICMP beantwortet** ist die richtige Antwort: Troubleshooting-Falle: Der VIP hängt an keinem Interface; iptables/IPVS/eBPF übersetzen nur `VIP:port`. Services mit `nc -zv`/`curl` testen, nie mit ping.
