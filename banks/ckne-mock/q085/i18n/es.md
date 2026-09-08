## Question

Un HTTPRoute necesita backendRefs hacia un Service de OTRO namespace. ¿Qué se requiere?

## Options

- Volver a crear el Service como NodePort
- Un ReferenceGrant en el namespace del Service que autorice la route
- Nada; las referencias entre namespaces están permitidas de forma predeterminada
- Colocar el Gateway en kube-system

## Solution

**Un ReferenceGrant en el namespace del Service que autorice la route** es la respuesta correcta: Las referencias entre namespaces se deniegan de forma predeterminada para evitar el "secuestro" de tráfico. El propietario del namespace de destino publica un `ReferenceGrant` que declara from (kind/namespace) y to (kind/name); solo entonces se resuelve la route.
