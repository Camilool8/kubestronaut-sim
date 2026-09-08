## Question

El Gateway está en el namespace "infra" y el Secret TLS en el namespace "apps". El listener referencia el Secret, pero el estado muestra RefNotPermitted. ¿Qué falta?

## Options

- Colocar el Gateway en kube-system
- Marcar el Secret como público mediante una annotation
- Un ReferenceGrant en "apps" que permita Gateways procedentes de "infra"
- Copiar manualmente el Secret al namespace infra

## Solution

**Un ReferenceGrant en "apps" que permita Gateways procedentes de "infra"** es la respuesta correcta: Las referencias cross-namespace a Secrets requieren consentimiento explícito del propietario del Secret: un `ReferenceGrant` en "apps" con from (Gateway/infra) y to (Secret). Sin él, Gateway API lo deniega por seguridad, evitando la exfiltración de certificados.
