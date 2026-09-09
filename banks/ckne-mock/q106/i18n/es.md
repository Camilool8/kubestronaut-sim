## Question

En Calico, ¿cómo crea un deny explícito con precedencia sobre las reglas allow?

## Options

- El deny explícito es imposible en cualquier CNI
- Policies de Calico con action: Deny y el campo order
- Con una annotation deny=true en la policy nativa
- Eliminando el CNI

## Solution

**Policies de Calico con action: Deny y el campo order** es la respuesta correcta: Las policies de Calico tienen `order` y acciones Allow/Deny/Log/Pass, como un firewall clásico. Un Deny con order bajo vence a allows posteriores. La API nativa no ofrece esto; por eso los entornos regulados utilizan CRD del CNI o AdminNetworkPolicy.
