## Question

Как проверить, что шифрование WireGuard в Cilium действительно включено и шифрует трафик между узлами?

## Options

- cilium status | grep Encryption
- kubectl get secrets
- Выполнить ping между pods
- Посмотреть цвета pods в dashboard

## Solution

**cilium status | grep Encryption** — правильный ответ: Проверка в три слоя: agent сообщает режим; `wg show` подтверждает peers и недавние handshakes; capture на физической NIC должен показывать только packets WireGuard UDP 51871 вместо открытого payload между IP pods.
