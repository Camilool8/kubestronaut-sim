## Question

Помимо A-записей какой тип DNS-записей Kubernetes создаёт для именованных портов Service и в каком формате?

## Options

- TXT-записи с YAML Service
- SRV в формате _port._proto.service.ns.svc.cluster.local
- MX-записи для каждого именованного порта Service
- NS-записи для каждого namespace

## Solution

**SRV в формате _port._proto.service.ns.svc.cluster.local** — правильный ответ: Для каждого именованного порта создаётся SRV, например `_http._tcp.my-svc.default.svc.cluster.local`, возвращающий port и host. Приложения могут динамически обнаруживать порт через SRV без hardcoding.
