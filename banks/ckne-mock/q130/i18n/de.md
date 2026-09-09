## Question

Nach der Calico-Migration von VXLAN auf IPIP stoppte der Node-übergreifende Pod-Traffic NUR in der Cloud-Umgebung. Wahrscheinliche Ursache?

## Options

- IPIP nutzt das IP-Protokoll 4
- Die MTU stieg von selbst
- IPIP existiert nicht mehr
- kube-proxy hasst IPIP

## Solution

**IPIP nutzt das IP-Protokoll 4** ist die richtige Antwort: IPIP-Kapselung hat keine Ports — es ist IP-Protokoll Nummer 4 (nicht TCP/UDP). Security Groups, die nur TCP/UDP/ICMP erlauben, verwerfen es stumm. VXLAN (UDP 4789/8472) passiert meist. Protokoll 4 freigeben oder zurück zu VXLAN.
