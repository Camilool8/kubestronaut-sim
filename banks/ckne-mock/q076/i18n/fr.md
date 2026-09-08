## Question

Outre les A, quel type d'enregistrement DNS Kubernetes crée-t-il pour les ports nommés d'un Service, et sous quel format ?

## Options

- Des TXT avec le YAML du Service
- SRV au format _port._proto.service.ns.svc.cluster.local
- Des MX pour chaque port nommé du Service
- Des NS par namespace

## Solution

**SRV au format _port._proto.service.ns.svc.cluster.local** est la bonne réponse : Pour chaque port nommé, un SRV `_http._tcp.my-svc.default.svc.cluster.local` est créé, renvoyant port et hôte. Les applications peuvent découvrir le port dynamiquement via SRV, sans le coder en dur.
