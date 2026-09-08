## Question

O listener do Gateway define hostname *.example.com e um HTTPRoute declara hostnames [app.example.com, app.other.com]. O que acontece?

## Options

- Os dois hostnames funcionam
- Apenas a interseção é atendida
- O Gateway assume app.other.com automaticamente
- O route inteiro é rejeitado

## Solution

**Apenas a interseção é atendida** é a resposta correta: O binding listener↔route considera a interseção dos hostnames: só nomes compatíveis com o hostname do listener são programados. O status do HTTPRoute (Accepted/ResolvedRefs) mostra o resultado do attach — sempre confira com `kubectl describe httproute`.
