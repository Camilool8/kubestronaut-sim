## Question

Какой filter HTTPRoute позволяет добавить header, например X-Env: prod, ко всем запросам, отправляемым backend?

## Options

- requestHeaderModifier
- corsPolicy
- urlRewrite
- requestMirror

## Solution

**requestHeaderModifier** — правильный ответ: Filter `RequestHeaderModifier` добавляет, задаёт или удаляет headers запроса; существует также ResponseHeaderModifier. `URLRewrite` меняет hostname/path, а `RequestMirror` копирует трафик на другой backend.
