## Question

Was ist der echte Unterschied zwischen hostPort (am Pod) und einem NodePort-Service?

## Options

- Sie sind identisch
- NodePort funktioniert nur in der Cloud
- hostPort ist sicherer und balanciert besser
- hostPort öffnet den Port NUR auf dem Node des Pods

## Solution

**hostPort öffnet den Port NUR auf dem Node des Pods** ist die richtige Antwort: `hostPort` koppelt Pod↔Node (via CNI portmap; Port-Kollisionen limitieren das Scheduling) und balanciert nicht; NodePort wird von kube-proxy auf ALLEN Nodes geöffnet und balanciert zu den Endpoints. Die Verwechslung erzeugt "läuft auf einem Node, scheitert auf den anderen".
