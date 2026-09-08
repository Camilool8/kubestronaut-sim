## Question

Какое преимущество даёт указание targetPort по ИМЕНИ, например targetPort: http, вместо номера?

## Options

- Это быстрее
- Имя ссылается на именованный containerPort каждого pod
- Это предотвращает конфликты с NodePort
- Имена портов обязательны в Gateway API

## Solution

**Имя ссылается на именованный containerPort каждого pod** — правильный ответ: При `targetPort: http` каждый pod задаёт `ports[].name: http` с любым номером, например 8080 или 3000. Service разрешает его отдельно для каждого pod, что удобно при migrations и rolling updates со сменой порта приложения.
