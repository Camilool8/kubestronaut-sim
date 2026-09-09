## Question

Welche Aussage zum Verhalten von NetworkPolicies ist korrekt?

## Options

- Policies brauchen numerische Prioritäten
- Die zuletzt angewandte Policy überschreibt frühere
- Policies sind additiv (Allow-List)
- Policies funktionieren auch ohne CNI-Support

## Solution

**Policies sind additiv (Allow-List)** ist die richtige Antwort: Native NetworkPolicies erlauben nur: Wird ein Pod selektiert, ist er isoliert; erlaubt ist die Vereinigung aller Regeln. Kein explizites Deny, keine Präzedenz — und das Enforcement hängt am CNI (pures Flannel ignoriert Policies). Cilium/Calico-CRDs ergänzen Deny und Priorität.
