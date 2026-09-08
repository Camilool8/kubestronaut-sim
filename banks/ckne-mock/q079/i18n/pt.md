## Question

Qual filtro do HTTPRoute permite adicionar um header (ex.: X-Env: prod) a todas as requisições encaminhadas ao backend?

## Options

- requestHeaderModifier
- corsPolicy
- urlRewrite
- requestMirror

## Solution

**requestHeaderModifier** é a resposta correta: O filtro `RequestHeaderModifier` adiciona/define/remove headers no caminho da requisição (há também ResponseHeaderModifier). `URLRewrite` altera hostname/path; `RequestMirror` espelha tráfego para outro backend.
