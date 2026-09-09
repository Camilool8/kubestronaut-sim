## Question

Sans kubectl exec disponible, comment entrer dans le namespace réseau d'un pod depuis le nœud pour déboguer ?

## Options

- Redémarrer le kubelet avec --debug-netns
- Éditer le /etc/network/interfaces du nœud et recharger
- crictl inspect pour obtenir le PID, puis nsenter -t `<PID>` -n
- ssh directement vers l'IP du pod

## Solution

**crictl inspect pour obtenir le PID, puis nsenter -t `<PID>` -n** est la bonne réponse : `crictl ps` + `crictl inspect --output go-template --template '{{.info.pid}}'` donnent le PID ; `nsenter -t PID -n ip addr` (ou ss, tcpdump…) exécute des commandes dans le netns du pod avec les outils de l'hôte.
