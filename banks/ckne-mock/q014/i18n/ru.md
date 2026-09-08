## Question

Нужно направлять все запросы к внутреннему домену corp.example.com на корпоративный DNS 10.50.0.2. Что следует сделать в CoreDNS?

## Options

- Добавить server block в Corefile
- Изменить /etc/hosts на каждом узле
- Создать Service ExternalName с именем corp.example.com
- Добавить зону в kubelet через --cluster-domain

## Solution

**Добавить server block в Corefile** — правильный ответ: Corefile (ConfigMap `coredns` в kube-system) поддерживает несколько server blocks. Отдельный блок с plugin `forward` создаёт stub domain. Другие полезные plugins: `rewrite`, `hosts`, `log`.
