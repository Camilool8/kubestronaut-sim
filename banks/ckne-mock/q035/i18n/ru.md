## Question

Какое утверждение о поведении NetworkPolicy верно?

## Options

- Policies требуют числового порядка priority
- Последняя применённая policy переопределяет предыдущие
- Policies аддитивны и образуют allow-list
- Policies работают даже без поддержки CNI

## Solution

**Policies аддитивны и образуют allow-list** — правильный ответ: Нативные NetworkPolicies только разрешают трафик: выбор pod изолирует его, а разрешённый трафик является объединением всех policies. Явного deny и precedence нет; enforcement зависит от CNI — обычный Flannel policies игнорирует. CRDs Cilium/Calico добавляют deny и priority.
