## Question

Quelle est la plage de ports par défaut allouée aux Services NodePort ?

## Options

- 8000–9000
- 30000–32767
- 1024–2048
- 49152–65535

## Solution

**30000–32767** est la bonne réponse : La plage par défaut est `30000–32767`, configurable sur le kube-apiserver avec `--service-node-port-range`. Chaque NodePort est ouvert sur tous les nœuds et redirige vers les endpoints du Service.
