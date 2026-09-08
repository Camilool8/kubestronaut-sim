## Question

Что происходит с новыми соединениями к ClusterIP, если у Service НЕТ ready endpoints?

## Options

- Перенаправляются в apiserver
- Немедленно отклоняются REJECT с «connection refused»
- Они становятся в очередь ядра до запуска pod
- Получают HTTP 404, сгенерированный kube-proxy

## Solution

**Немедленно отклоняются REJECT с «connection refused»** — правильный ответ: kube-proxy устанавливает reject rule для Services без endpoints, поэтому клиент сразу получает «connection refused». Различие между refused — нет endpoints или неверный порт — и timeout — policy, route или firewall — значительно ускоряет troubleshooting.
