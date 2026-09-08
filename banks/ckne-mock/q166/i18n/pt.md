## Question

Um cliente de alta vazão para o mesmo destino começa a falhar com "cannot assign requested address"; `ss -s` no pod mostra dezenas de milhares de conexões TIME_WAIT. Qual é o problema?

## Options

- O kernel está corrompido
- MTU baixa
- Falta de DNS
- Esgotamento de portas efêmeras

## Solution

**Esgotamento de portas efêmeras** é a resposta correta: Padrão "abrir-fechar por requisição" mata o cliente antes do servidor: ~28k portas efêmeras ÷ 60s de TIME_WAIT ≈ teto de ~470 conexões novas/s por destino. Pooling resolve na arquitetura, não no sysctl.
