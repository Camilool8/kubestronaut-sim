## Question

Aplicou-se uma AuthorizationPolicy com spec totalmente vazio ({}) no namespace prod. Qual é o efeito?

## Options

- Só loga, sem bloquear
- Erro de validação
- Permite tudo (spec vazio = sem restrição)
- NEGA todo o tráfego do namespace

## Solution

**NEGA todo o tráfego do namespace** é a resposta correta: Inversão cruel: existir uma AuthorizationPolicy ALLOW que não casa nada = nada é permitido. É inclusive o jeito idiomático de fazer deny-all. Compare com NetworkPolicy `ingress: [{}]` (permite tudo) — os vazios têm semânticas opostas!
