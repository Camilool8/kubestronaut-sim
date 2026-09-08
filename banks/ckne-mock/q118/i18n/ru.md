## Question

Какой manifest полностью изолирует все pods namespace — запрещает весь входящий И весь исходящий трафик?

## Options

- Удалить все Services
- Только policyTypes: [Ingress] с podSelector: {}
- podSelector: {} с policyTypes: [Ingress, Egress] и без ingress/egress rules
- podSelector: {} с объявленными ingress: [{}] и egress: [{}]

## Solution

**podSelector: {} с policyTypes: [Ingress, Egress] и без ingress/egress rules** — правильный ответ: Выбор всех pods и объявление обоих policyTypes без rules создаёт полный default deny. Вариант с `[{}]` разрешает всё, поскольку пустое rule совпадает с любым source/destination; это классическая экзаменационная ловушка. Доступ затем добавляется отдельными policies.
