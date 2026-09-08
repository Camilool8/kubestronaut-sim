## Question

O que faz um Service do tipo ExternalName?

## Options

- Cria um NodePort com nome customizado
- Exige um LoadBalancer provisionado na nuvem para funcionar
- Retorna um CNAME para um DNS externo, sem proxy nem endpoints
- Atribui um IP externo fixo ao pod

## Solution

**Retorna um CNAME para um DNS externo, sem proxy nem endpoints** é a resposta correta: `ExternalName` é puramente DNS: consultas devolvem um CNAME para `spec.externalName`. Não há VIP, kube-proxy nem balanceamento — útil para abstrair serviços externos com nomes internos.
