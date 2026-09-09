## Question

Какая команда Hubble в реальном времени показывает только потоки со статусом DROPPED и причину, например Policy denied?

## Options

- hubble observe --verdict DROPPED
- kubectl logs cilium
- hubble encrypt --all --follow
- hubble delete flows --verdict ALL

## Solution

**hubble observe --verdict DROPPED** — правильный ответ: `hubble observe --verdict DROPPED` показывает каждый отброшенный поток с источником, назначением, портом и причиной — Policy denied, connection tracking и т. п. Это самый быстрый способ определить, какая NetworkPolicy блокирует соединение.
