## Question

Соединения периодически прерываются под нагрузкой, а dmesg узла показывает «nf_conntrack: table full, dropping packet». Какая метрика подтверждает проблему и как её исправить?

## Options

- Перезапуск CNI навсегда исправляет проблему
- Сравнить node_nf_conntrack_entries с node_nf_conntrack_entries_limit
- Наблюдать apiserver_request_total и масштабировать apiserver
- Проверить coredns_cache_hits_total и очистить cache CoreDNS

## Solution

**Сравнить node_nf_conntrack_entries с node_nf_conntrack_entries_limit** — правильный ответ: Каждое соединение с NAT занимает запись conntrack. Переполненная таблица вызывает тихие drops и периодические сбои. Контролируйте отношение entries/limit через node_exporter и настройте `nf_conntrack_max`.
