## Question

Qual vantagem existe em definir targetPort com um NOME (ex.: targetPort: http) em vez de número?

## Options

- Fica mais rápido
- O nome referencia a containerPort nomeada de cada pod
- Evita conflito com NodePort
- Nomes de porta são obrigatórios no Gateway API

## Solution

**O nome referencia a containerPort nomeada de cada pod** é a resposta correta: Com `targetPort: http`, cada pod define `ports[].name: http` com o número que quiser (8080, 3000…). O Service resolve por pod — útil em migrações e rolling updates que mudam a porta da aplicação.
