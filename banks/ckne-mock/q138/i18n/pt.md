## Question

Definir sessionAffinity: ClientIP em um HEADLESS Service tem qual efeito?

## Options

- Nenhum efeito prático no fluxo
- Transforma o Service em NodePort
- Erro de validação sempre
- Afinidade perfeita por cliente

## Solution

**Nenhum efeito prático no fluxo** é a resposta correta: Afinidade é função do proxy (kube-proxy) sobre o VIP. Headless entrega DNS puro — quem "balanceia" é o resolver/cliente. Configuração aceita, efeito nulo: clássico de prova.
