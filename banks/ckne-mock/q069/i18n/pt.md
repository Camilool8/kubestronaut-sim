## Question

Aplicações reclamam de lentidão ao resolver nomes externos (ex.: api.github.com) de dentro dos pods. O tcpdump mostra várias consultas NXDOMAIN antes da resposta certa. Qual é a causa e a mitigação?

## Options

- O CoreDNS está corrompido e responde com atraso
- O TTL do registro é zero
- Expansão do ndots:5 pelos search domains (use FQDN com ponto)
- Falta banda de rede entre os nós e o CoreDNS

## Solution

**Expansão do ndots:5 pelos search domains (use FQDN com ponto)** é a resposta correta: Com `ndots:5`, qualquer nome com menos de 5 pontos é expandido pelos search domains antes da consulta absoluta — gerando 3–5 consultas extras (NXDOMAIN) por resolução. O ponto final força consulta absoluta; `dnsConfig.options ndots:1` muda o comportamento por pod.
