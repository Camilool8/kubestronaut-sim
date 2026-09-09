## Question

Service настроен правильно (port 80 → targetPort 8080), endpoints готовы, но каждое соединение получает connection refused. Внутри pod `ss -tlnp` показывает процесс на 127.0.0.1:8080. В чём проблема?

## Options

- kube-proxy не работает на этом узле
- Приложение слушает только localhost
- Требуется hostNetwork
- Порт 8080 зарезервирован kubelet

## Solution

**Приложение слушает только localhost** — правильный ответ: Главная ловушка connection refused при внешне правильной конфигурации — bind только на loopback. DNAT доставляет трафик на IP pod, где никто не слушает. `ss -tlnp` внутри pod сразу это показывает.
