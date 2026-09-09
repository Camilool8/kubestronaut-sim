## Question

Como registrar TODAS as consultas DNS que o CoreDNS recebe, para auditoria/depuração temporária?

## Options

- Adicionar o plugin log ao bloco do Corefile
- tcpdump permanente em todos os nós
- Habilitar audit no kube-apiserver
- Não é possível logar DNS

## Solution

**Adicionar o plugin log ao bloco do Corefile** é a resposta correta: O plugin `log` imprime cada consulta (nome, tipo, rcode, duração) no stdout do CoreDNS. Pelo volume, use temporariamente ou com escopo (ex.: `log example.com`). Para auditoria contínua e por pod, prefira métricas/fluxos DNS do Hubble.
