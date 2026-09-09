## Question

Dois containers do MESMO pod tentam escutar na porta 8080. O que acontece?

## Options

- Funciona: cada container tem seu namespace de rede
- O kubelet cria um segundo IP
- O tráfego é balanceado entre eles
- O segundo falha com "address already in use"

## Solution

**O segundo falha com "address already in use"** é a resposta correta: O netns pertence ao sandbox (pause container); todos os containers do pod o compartilham — por isso localhost funciona entre eles e portas colidem.
