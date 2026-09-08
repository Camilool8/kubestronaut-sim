## Question

hubble observe mostra drops com veredito "Policy denied" no sentido pod→kube-dns APÓS você aplicar uma policy de egress ao namespace. As aplicações reclamam de nomes que não resolvem. Qual é a leitura correta do fluxo?

## Options

- kube-dns mudou de porta
- O flow log confirma a causa raiz
- O CoreDNS caiu e derrubou a resolução
- O Hubble está errado nesse tipo de fluxo

## Solution

**O flow log confirma a causa raiz** é a resposta correta: Fluxos DROPPED com destino kube-dns:53 logo após aplicar egress policy = assinatura inconfundível do esquecimento da regra de DNS. O Hubble transforma "DNS parou misteriosamente" em causa-efeito visível.
