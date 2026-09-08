## Question

Dans quel répertoire le kubelet cherche-t-il, par défaut, les fichiers de configuration réseau CNI ?

## Options

- /etc/kubernetes/cni/
- /opt/cni/bin/
- /etc/cni/net.d/
- /var/lib/cni/conf/

## Solution

**/etc/cni/net.d/** est la bonne réponse : Les fichiers de configuration (*.conf / *.conflist) vivent dans `/etc/cni/net.d/`, les binaires des plugins dans `/opt/cni/bin/`. Si le répertoire de config est vide, les nœuds restent NotReady avec l'erreur « cni plugin not initialized ».
