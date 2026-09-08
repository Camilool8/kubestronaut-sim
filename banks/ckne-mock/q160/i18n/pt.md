## Question

Com PeerAuthentication em modo PERMISSIVE (padrão), o dashboard mostra 'mTLS: enabled' e a auditoria aprova. Qual é o risco escondido?

## Options

- PERMISSIVE cifra só metade dos pacotes
- STRICT quebra o TLS
- Nenhum, PERMISSIVE é seguro
- PERMISSIVE aceita TAMBÉM texto claro

## Solution

**PERMISSIVE aceita TAMBÉM texto claro** é a resposta correta: Pegadinha de auditoria: PERMISSIVE existe para migração (aceita mTLS E plaintext). Verifique com uma conexão de teste sem sidecar — se entrar, o enforcement não existe. Feche com STRICT por namespace.
