## Question

Das Dashboard zeigt eine NXDOMAIN-Explosion in CoreDNS; das Team vermutet einen Angriff. Die Queries sehen aus wie api.stripe.com.default.svc.cluster.local. Korrekte Diagnose?

## Options

- CoreDNS hat keinen Speicher mehr
- CoreDNS wurde kompromittiert
- Ein DNS-Tunneling-Angriff
- Normales Verhalten von ndots:5

## Solution

**Normales Verhalten von ndots:5** ist die richtige Antwort: Vor dem "Angriff!"-Ruf das SUFFIX der fehlgeschlagenen Queries ansehen: externe Namen + Search-Domains = ndots-Expansion mit legitimen NXDOMAINs vor der richtigen Antwort. Optimierbar per FQDN (Punkt am Ende) oder niedrigerem ndots.
