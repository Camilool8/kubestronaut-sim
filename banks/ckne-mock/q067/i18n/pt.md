## Question

Entre dois pods, o ping (ICMP) funciona, mas conexões TCP na porta 8080 falham. Quais são as duas causas mais prováveis a investigar?

## Options

- NetworkPolicy L4 restritiva, ou problema de MTU/PMTUD
- O ICMP está desabilitado no kernel dos dois nós
- O DNS está fora do ar no namespace do pod
- O pod precisa de privilégios root

## Solution

**NetworkPolicy L4 restritiva, ou problema de MTU/PMTUD** é a resposta correta: ICMP pequeno atravessa caminhos que descartam pacotes grandes (MTU) e pode ser tratado diferente por policies. Teste com `nc -zv`, compare payloads pequenos vs. grandes (`curl` de arquivos maiores trava?) e revise policies L4.
