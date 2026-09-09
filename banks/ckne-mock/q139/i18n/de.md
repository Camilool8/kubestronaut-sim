## Question

Beim Debugging funktioniert `kubectl port-forward svc/my-api 8080:80`, aber in Produktion scheitern Pods am selben Service. Warum validiert port-forward NICHT den echten Pfad?

## Options

- Direkter Tunnel zu EINEM Pod via Apiserver, am Service-Pfad vorbei
- Produktion nutzt immer einen anderen Cluster und ein anderes Image
- port-forward nutzt UDP
- port-forward ist langsamer

## Solution

**Direkter Tunnel zu EINEM Pod via Apiserver, am Service-Pfad vorbei** ist die richtige Antwort: Der Tunnel läuft über Apiserver/Kubelet an kube-proxy, ClusterIP, DNS und NetworkPolicies vorbei. Er kann mit kaputtem DNS, blockierenden Policies und totem kube-proxy funktionieren. Den echten Pfad testet man aus einem Pod HERAUS.
