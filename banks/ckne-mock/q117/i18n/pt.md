## Question

Com criptografia WireGuard node-to-node habilitada no CNI, o tráfego entre dois pods no MESMO nó é criptografado?

## Options

- Não: a criptografia cobre o tráfego que atravessa a rede ENTRE nós
- Sim, sempre
- Somente para UDP
- Somente se os pods forem de namespaces diferentes

## Solution

**Não: a criptografia cobre o tráfego que atravessa a rede ENTRE nós** é a resposta correta: O objetivo é proteger o tráfego "no fio" contra interceptação na rede. Pacotes entre pods do mesmo nó trafegam apenas pela memória/bridge local. Se o requisito é cifrar e autenticar TODO salto lógico, combine com mTLS de mesh.
