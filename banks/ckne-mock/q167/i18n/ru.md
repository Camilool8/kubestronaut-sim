## Question

В сетевом dashboard Grafana по pod появились миллионы series, а Prometheus потребляет десятки гигабайт. Обычно главный источник проблемы — это:

## Options

- Тёмная тема Grafana
- Слишком много цветов на графиках
- Слишком много одновременно открытых dashboard
- Взрыв cardinality из-за labels для каждого эфемерного pod, veth или IP

## Solution

**Взрыв cardinality из-за labels для каждого эфемерного pod, veth или IP** — правильный ответ: Series для эфемерных сущностей — hash pod, veth и IP — продолжают накапливаться. Основное правило сетевой observability: label должен описывать стабильное, например namespace или workload, а не эфемерную реализацию.
