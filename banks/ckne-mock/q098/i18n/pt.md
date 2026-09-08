## Question

Antes de promover uma nova versão, você quer enviar uma CÓPIA do tráfego real de produção para ela, sem que as respostas afetem os clientes. Qual filtro do HTTPRoute faz isso?

## Options

- requestMirror (shadow traffic)
- urlRewrite
- retryPolicy
- backendRefs com weight 50/50

## Solution

**requestMirror (shadow traffic)** é a resposta correta: O `RequestMirror` implementa shadowing: produção continua atendida pelo backend principal enquanto a nova versão recebe tráfego idêntico para validação de erros/latência — sem risco para o usuário (diferente do canary, que serve respostas reais).
