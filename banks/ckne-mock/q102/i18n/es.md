## Question

¿Puede una NetworkPolicy creada en el namespace "prod" seleccionar y aislar pods del namespace "dev"?

## Options

- Solo si el CNI es Calico
- Sí, mediante la annotation cross-namespace
- No: NetworkPolicy tiene alcance de namespace
- Sí, si utiliza namespaceSelector

## Solution

**No: NetworkPolicy tiene alcance de namespace** es la respuesta correcta: `spec.podSelector` selecciona objetivos ÚNICAMENTE en el namespace de la policy. `namespaceSelector` solo aparece en reglas from/to para definir orígenes o destinos permitidos, nunca para elegir quién queda aislado. Para alcance de cluster, utilice AdminNetworkPolicy o CRD del CNI.
