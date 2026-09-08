## Question

Une HTTPRoute dans un namespace différent du Gateway ne fonctionne pas. Que faut-il généralement ajuster ?

## Options

- Le champ listeners.allowedRoutes.namespaces du Gateway
- Le Service backend doit être NodePort
- Les HTTPRoutes ne marchent que dans le namespace du Gateway, sans exception
- La HTTPRoute a besoin de hostNetwork

## Solution

**Le champ listeners.allowedRoutes.namespaces du Gateway** est la bonne réponse : Par défaut, `allowedRoutes.namespaces.from` vaut `Same`. Pour accepter des routes d'autres namespaces, utilisez `from: All` ou `from: Selector` sur le listener. Pour des backends dans d'autres namespaces, il faut en plus un `ReferenceGrant`.
