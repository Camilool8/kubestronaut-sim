## Question

Какая NetworkPolicy реализует «default deny» для ingress ко всем pods namespace?

## Options

- podSelector: {} с policyTypes: [Ingress] и без ingress rules
- Исключение namespace из CNI
- podSelector: deny-all с policyTypes: [Ingress]
- Policy с ingress: [{}], охватывающая все pods

## Solution

**podSelector: {} с policyTypes: [Ingress] и без ingress rules** — правильный ответ: `podSelector: {}` выбирает все pods; объявление `policyTypes: [Ingress]` без rules блокирует весь входящий трафик. Внимание: `ingress: [{}]` делает обратное — разрешает всё.
