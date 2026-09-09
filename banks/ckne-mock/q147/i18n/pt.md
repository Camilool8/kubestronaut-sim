## Question

Em bare-metal, você criou o Gateway e ele fica com ADDRESS vazio e condição Programmed: False indefinidamente. HTTPRoutes estão corretos. O que falta?

## Options

- Anotar o Gateway com o static-ip do nó master
- HTTPRoute deve vir antes do Gateway
- Falta um provedor de VIP (LB-IPAM/MetalLB) para o endereço
- Reiniciar o apiserver

## Solution

**Falta um provedor de VIP (LB-IPAM/MetalLB) para o endereço** é a resposta correta: Mesma raiz do clássico "LoadBalancer pending": a implementação do Gateway pede um endereço, e em bare-metal ninguém responde. LB-IPAM/MetalLB alocam o IP; L2 ou BGP o anunciam.
