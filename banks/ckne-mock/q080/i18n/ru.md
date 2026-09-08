## Question

Listener Gateway задаёт hostname *.example.com, а HTTPRoute объявляет hostnames [app.example.com, app.other.com]. Что произойдёт?

## Options

- Оба hostname будут работать
- Будет обслуживаться только пересечение
- Gateway автоматически примет app.other.com
- Весь route будет отклонён

## Solution

**Будет обслуживаться только пересечение** — правильный ответ: Привязка listener↔route учитывает пересечение hostnames: программируются только имена, совместимые с hostname listener. Status HTTPRoute (Accepted/ResolvedRefs) показывает результат attach; всегда проверяйте `kubectl describe httproute`.
