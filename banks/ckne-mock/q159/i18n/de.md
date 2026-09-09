## Question

Sie sollen nur GET /public/* am Service erlauben und POST sowie andere Pfade blockieren — per Netzwerk-Policy des CNI. Was erfordert das?

## Options

- Native NetworkPolicy mit einem httpRules-Feld für HTTP-Methoden
- Nur eine externe Firewall am Rand des Rechenzentrums
- L7-Regeln (z. B. CiliumNetworkPolicy mit toPorts.rules.http method/path)
- endPort über den HTTP-Portbereich genügt

## Solution

**L7-Regeln (z. B. CiliumNetworkPolicy mit toPorts.rules.http method/path)** ist die richtige Antwort: Filtern nach Methode/Pfad ist L7: Cilium injiziert für die betroffenen Flows einen transparenten Proxy (Envoy) — die native API sieht kein HTTP. Prüfungsrelevant: L7-Policies fügen genau dort einen Proxy-Hop (Latenz) hinzu, wo sie gelten.
