## Question

Auf Bare-Metal bleibt das Gateway mit leerer ADDRESS und Programmed: False. Die HTTPRoutes sind korrekt. Was fehlt?

## Options

- Das Gateway mit der static-ip des Master-Nodes annotieren
- Die HTTPRoute muss vor dem Gateway kommen
- Es fehlt ein VIP-Provider (LB-IPAM/MetalLB) für die Adresse
- Den Apiserver neu starten

## Solution

**Es fehlt ein VIP-Provider (LB-IPAM/MetalLB) für die Adresse** ist die richtige Antwort: Gleiche Wurzel wie das klassische "LoadBalancer pending": Die Gateway-Implementierung fordert eine Adresse an, und auf Bare-Metal antwortet niemand. LB-IPAM/MetalLB vergeben die IP; L2 oder BGP announcen sie.
