## Question

В чём различие между двумя ingress rules?

```
(A) - from: [{namespaceSelector: X}, {podSelector: Y}]
(B) - from: [{namespaceSelector: X, podSelector: Y}]
```

## Options

- (B) синтаксически недействительно и отклоняется apiserver
- Они идентичны
- (A) означает OR между источниками; (B) означает AND — pods Y внутри namespaces X
- (A) применяется только к egress, а (B) — только к ingress

## Solution

**(A) означает OR между источниками; (B) означает AND — pods Y внутри namespaces X** — правильный ответ: Отдельные элементы списка `from` являются альтернативами OR; поля в одном элементе являются совместными условиями AND. Один дополнительный дефис полностью меняет область доступа.
