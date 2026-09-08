## Question

Нужно разрешить только GET /public/* к Service, блокируя POST и другие пути, с помощью network policy CNI. Что требуется?

## Options

- Нативная NetworkPolicy с полем httpRules
- Только внешний firewall на границе дата-центра
- L7-правила, например CiliumNetworkPolicy с toPorts.rules.http method/path
- Достаточно endPort, охватывающего диапазон HTTP-портов

## Solution

**L7-правила, например CiliumNetworkPolicy с toPorts.rules.http method/path** — правильный ответ: Фильтрация по HTTP-методу и пути относится к L7. Cilium может включить прозрачный proxy для потоков, подпадающих под такое правило. L7-policy добавляет proxy-hop только там, где она применяется.
