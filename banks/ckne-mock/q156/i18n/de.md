## Question

Ein Pod mit hostNetwork: true erreicht Pods, die eine NetworkPolicy nur für bestimmte podSelectors freigibt — und der Zugriff FUNKTIONIERT. Warum?

## Options

- hostNetwork aktiviert einen administrativen Netzwerkmodus
- NetworkPolicies haben einen bekannten Bug mit TCP-Keepalive
- Die Policy gilt nur für TCP, und der Zugriff nutzt UDP
- Sein Traffic stammt von der NODE-IP, nicht von einer Pod-Identität

## Solution

**Sein Traffic stammt von der NODE-IP, nicht von einer Pod-Identität** ist die richtige Antwort: hostNetwork-Pods "sind der Node" fürs Netz. Viele CNIs behandeln Node-IPs speziell (Kubelet-Probes müssen passieren) — Pod-Identity-Policies beschränken sie nicht wie erwartet. Vorsicht mit dem, was in hostNetwork läuft.
