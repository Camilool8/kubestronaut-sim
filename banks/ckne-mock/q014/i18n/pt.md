## Question

Você precisa encaminhar todas as consultas do domínio interno corp.example.com para o DNS corporativo 10.50.0.2. O que fazer no CoreDNS?

## Options

- Adicionar um bloco de servidor no Corefile
- Editar o /etc/hosts de cada nó
- Criar um Service ExternalName chamado corp.example.com
- Adicionar a zona no kubelet com --cluster-domain

## Solution

**Adicionar um bloco de servidor no Corefile** é a resposta correta: O Corefile (ConfigMap `coredns` em kube-system) aceita múltiplos blocos de servidor. Um bloco dedicado com o plugin `forward` cria um stub domain. Outros plugins úteis: `rewrite`, `hosts`, `log`.
