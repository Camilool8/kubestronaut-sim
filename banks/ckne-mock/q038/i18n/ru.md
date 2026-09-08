## Question

Какую возможность CNI следует включить для прозрачного шифрования всего трафика pod-to-pod между узлами без изменения приложений?

## Options

- kube-proxy в режиме IPVS
- NetworkPolicy с полем encrypt: true
- Шифрование WireGuard или IPsec в CNI
- TLS в CoreDNS

## Solution

**Шифрование WireGuard или IPsec в CNI** — правильный ответ: Cilium и Calico предоставляют прозрачное шифрование node-to-node: WireGuard с автоматическими ключами на узел или IPsec с ротацией через secret. Оно защищает трафик между узлами «на проводе» и дополняет mTLS приложений.
