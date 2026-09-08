## Question

CoreDNS переходит в CrashLoopBackOff сразу после установки и пишет `Loop ... detected`. Какова типичная причина на узлах с systemd-resolved?

## Options

- Недостаточные RBAC-права ServiceAccount CoreDNS
- Повреждённый image во внутреннем registry
- resolv.conf узла указывает на 127.0.0.53
- Слишком много реплик

## Solution

**resolv.conf узла указывает на 127.0.0.53** — правильный ответ: Плагин `loop` обнаруживает цикл forward → локальный stub → снова CoreDNS. Проблема решается правильной настройкой параметра kubelet `--resolv-conf` или эквивалентного поля конфигурации.
