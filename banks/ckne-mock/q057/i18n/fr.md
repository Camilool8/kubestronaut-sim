## Question

Des pods restent en ContainerCreating avec « failed to allocate for range 0: no IP addresses available in range ». Diagnostic et correctif ?

## Options

- Le DNS du cluster est tombé
- Le pool IPAM du nœud est épuisé
- Le kubelet manque de mémoire
- L'apiserver throttle les requêtes

## Solution

**Le pool IPAM du nœud est épuisé** est la bonne réponse : Chaque nœud a une plage finie (podCIDR /24 par défaut ≈ 254 IPs vs max-pods 110). Les crashes laissent des leases orphelins dans l'état IPAM (ex. `/var/lib/cni/networks/<net>`). Supprimez les fichiers d'IP sans conteneur associé ou agrandissez la plage.
