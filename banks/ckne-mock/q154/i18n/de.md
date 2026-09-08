## Question

Eine NetworkPolicy hat policyTypes: [Ingress], aber der Autor schrieb auch einen egress:-Block in die Spec. Welche Wirkung hat der egress-Block?

## Options

- Er wird normal angewandt
- Er blockiert allen Egress
- Er erzeugt einen Validierungsfehler
- Er wird IGNORIERT: policyTypes entscheidet

## Solution

**Er wird IGNORIERT: policyTypes entscheidet** ist die richtige Antwort: Das Enforcement folgt `policyTypes`, nicht der Präsenz von Abschnitten. Ohne "Egress" in der Liste haben die geschriebenen Egress-Regeln null Wirkung (und es entsteht keine Egress-Isolation). "Dekorative" Regeln rutschen durch Reviews — häufige Audit-/Prüfungsfalle.
