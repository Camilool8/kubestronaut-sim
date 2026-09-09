## Question

Ohne kubectl exec: Wie betreten Sie vom Node aus den Netzwerk-Namespace eines Pods zum Debuggen?

## Options

- Das Kubelet mit --debug-netns neu starten
- Das /etc/network/interfaces des Nodes editieren und neu laden
- crictl inspect für die PID, dann nsenter -t `<PID>` -n
- Direkt per ssh auf die Pod-IP

## Solution

**crictl inspect für die PID, dann nsenter -t `<PID>` -n** ist die richtige Antwort: `crictl ps` + `crictl inspect --output go-template --template '{{.info.pid}}'` liefern die PID; `nsenter -t PID -n ip addr` (oder ss, tcpdump …) führt Befehle im Pod-Netns mit den Tools des Hosts aus.
