## Question

Você precisa de um baseline de banda e latência pod-a-pod entre dois nós específicos antes de culpar a rede por lentidão da aplicação. Qual método direto?

## Options

- kubectl top nodes no horário de pico
- Aumentar réplicas do serviço e observar os gráficos
- iperf3 entre pods dos dois nós, comparando com o caso mesmo-nó
- Ler a documentação de capacidade do datacenter

## Solution

**iperf3 entre pods dos dois nós, comparando com o caso mesmo-nó** é a resposta correta: Sem baseline, todo debate é opinião. O par iperf3 mede o teto real do datapath (inclui overhead de encapsulamento/criptografia); a comparação mesmo-nó vs. entre-nós isola onde a degradação mora.
