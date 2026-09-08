## Question

Где хранится ключ при использовании IPsec в Cilium и какая operational practice обязательна?

## Options

- Жёстко задан в image agent
- В файле на ноутбуке администратора
- В Secret cilium-ipsec-keys
- Для IPsec ключ не требуется

## Solution

**В Secret cilium-ipsec-keys** — правильный ответ: Cilium читает key/algorithm из Secret `cilium-ipsec-keys`. Ротация является operational-задачей: создаётся новый ключ с увеличенным ID, и agents переходят без downtime. WireGuard, напротив, управляет ключами каждого узла автоматически.
