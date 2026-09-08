## Question

Quando você deve usar TLS Passthrough (TLSRoute) em vez de Terminate no Gateway?

## Options

- Quando o backend precisa terminar o TLS ele mesmo
- Quando não existe certificado disponível no backend
- Passthrough é apenas para UDP
- Sempre, pois é mais rápido

## Solution

**Quando o backend precisa terminar o TLS ele mesmo** é a resposta correta: Em `Passthrough`, o Gateway lê apenas o SNI do ClientHello e encaminha os bytes criptografados. Perde-se roteamento por path/header (sem visibilidade L7), mas o certificado fica sob controle do backend.
