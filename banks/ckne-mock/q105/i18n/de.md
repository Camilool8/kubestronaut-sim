## Question

Egress darf nur zu api.github.com, dessen IPs sich ständig ändern. Welche Lösung deckt das in Cilium nativ ab?

## Options

- hostAliases am Pod
- Native NetworkPolicy mit einem dns-Feld
- CiliumNetworkPolicy mit toFQDNs
- ipBlock mit allen manuell gepflegten GitHub-Ranges

## Solution

**CiliumNetworkPolicy mit toFQDNs** ist die richtige Antwort: Native NetworkPolicy kennt nur IPs/Selectors. Cilium fängt DNS ab (DNS-Proxy), lernt die für den erlaubten FQDN aufgelösten IPs und autorisiert sie dynamisch — die Policy folgt dem Namen. Zusätzlich DNS-Egress mit toPorts-53-Regeln erlauben.
