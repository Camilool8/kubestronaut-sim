## Question

После перезапуска pod график rate(container_network_transmit_bytes_total[5m]) для workload остаётся корректным, хотя counter сбросился в ноль. Почему?

## Options

- Функция rate() обнаруживает сброс counter
- Prometheus запрещает перезапуски
- Counters никогда не сбрасываются
- kubelet повторно отправляет старые данные

## Solution

**Функция rate() обнаруживает сброс counter** — правильный ответ: Функции PromQL `rate()` и `increase()` учитывают сбросы монотонных counters и восстанавливают прирост. Ручное вычитание сырых значений ломается при каждом перезапуске.
