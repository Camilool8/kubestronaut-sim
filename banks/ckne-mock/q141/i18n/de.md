## Question

Service korrekt (port 80 → targetPort 8080), Endpoints ready, aber jede Verbindung liefert "connection refused". Im Pod zeigt `ss -tlnp` den Prozess auf 127.0.0.1:8080. Problem?

## Options

- kube-proxy ist auf diesem Node down
- Die Anwendung bindet nur an localhost
- Es braucht hostNetwork
- Port 8080 ist vom Kubelet reserviert

## Solution

**Die Anwendung bindet nur an localhost** ist die richtige Antwort: Falle Nr. 1 bei "refused" trotz scheinbar korrekter Kette: Loopback-Bind. Das DNAT liefert an die Pod-IP (eth0), wo niemand lauscht — die App muss auf 0.0.0.0 hören. `ss -tlnp` im Pod entlarvt es sofort.
