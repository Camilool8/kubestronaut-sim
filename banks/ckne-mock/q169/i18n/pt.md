## Question

O SLO de disponibilidade do gateway é 99,9%/mês. Qual estratégia de alerta evita tanto o pager por blips quanto descobrir tarde um sangramento lento do error budget?

## Options

- Um único alerta fixo em 1% de erro
- Alertas de burn rate multi-janela
- Desligar alertas à noite
- Alertar em qualquer erro individual

## Solution

**Alertas de burn rate multi-janela** é a resposta correta: Burn rate = velocidade de consumo do error budget. Janelas curtas+longas combinadas capturam incidentes agudos E degradações lentas, com pouquíssimos falsos positivos — prática canônica de SRE para SLOs de rede.
