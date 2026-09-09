## Question

kubectl exec no pod mostra a interface eth0 UP com IP correto, mas NADA entra ou sai. No nó, `ip link` mostra o veth par com estado LOWERLAYERDOWN. O que isso indica?

## Options

- LOWERLAYERDOWN é o estado normal
- O pod precisa de mais CPU
- O DNS está mal configurado
- A outra ponta do par veth

## Solution

**A outra ponta do par veth** é a resposta correta: veth é um cabo com duas pontas: se a ponta do host cai ou sai da bridge, o link do pod fica sem camada física. Estados como `LOWERLAYERDOWN` apontam problema no lado do host, não dentro do pod.
