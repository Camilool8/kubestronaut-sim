## Question

Welche NetworkPolicy implementiert "default deny" für Ingress aller Pods eines Namespace?

## Options

- podSelector: {} mit policyTypes: [Ingress] und ohne Ingress-Regeln
- Den Namespace vom CNI ausschließen
- podSelector: deny-all mit policyTypes: [Ingress]
- Eine Policy mit ingress: [{}] für alle Pods

## Solution

**podSelector: {} mit policyTypes: [Ingress] und ohne Ingress-Regeln** ist die richtige Antwort: Ein `podSelector: {}` selektiert alle Pods; `policyTypes: [Ingress]` ohne Regeln blockiert allen eingehenden Traffic. Achtung: `ingress: [{}]` bewirkt das Gegenteil — es erlaubt alles.
