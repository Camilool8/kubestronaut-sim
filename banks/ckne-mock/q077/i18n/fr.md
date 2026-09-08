## Question

Comment faire qu'un Service du cluster balance vers un backend EXTERNE à IPs fixes (ex. base legacy 192.168.10.5:5432), avec un nom DNS interne ?

## Options

- Service sans selector + EndpointSlice manuel avec les IPs externes
- Installer la base dans le cluster en StatefulSet
- Impossible sans réécrire kube-proxy
- Utiliser hostNetwork

## Solution

**Service sans selector + EndpointSlice manuel avec les IPs externes** est la bonne réponse : Un Service sans `selector` ne génère pas d'endpoints automatiques ; on crée l'`EndpointSlice` (avec le label kubernetes.io/service-name) à la main avec les IPs externes. Contrairement à ExternalName (CNAME), on a ici un vrai VIP et du balancing.
