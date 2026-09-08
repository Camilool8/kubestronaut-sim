## Question

Wie erlauben Sie Egress eines Pods nur ins Subnetz 203.0.113.0/24, außer zum Host 203.0.113.9?

## Options

- Den Host als Blackhole-Route in /etc/hosts eintragen
- ipBlock unterstützt keine Ausnahmen
- Zwei getrennte Policies: eine Allow und eine Deny
- ipBlock mit cidr 203.0.113.0/24 und except 203.0.113.9/32

## Solution

**ipBlock mit cidr 203.0.113.0/24 und except 203.0.113.9/32** ist die richtige Antwort: `ipBlock` akzeptiert `cidr` plus eine `except`-Liste. Merke: Mit irgendeiner Egress-Policy wird alles andere blockiert — auch DNS; zusätzlich Port 53 zu kube-dns erlauben.
