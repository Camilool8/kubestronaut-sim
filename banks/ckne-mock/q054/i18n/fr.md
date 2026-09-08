## Question

Dans un fichier CNI .conflist, à quoi sert le tableau "plugins" avec plusieurs entrées (ex. cilium, portmap, bandwidth) ?

## Options

- Choisir le plugin selon le namespace du pod
- Exécuter chaque plugin sur un nœud différent
- Des plugins alternatifs, utilisés seulement si le premier échoue
- Chaining : les plugins s'exécutent en séquence

## Solution

**Chaining : les plugins s'exécutent en séquence** est la bonne réponse : Le chaining CNI exécute les plugins dans l'ordre : le premier (main) crée et configure l'interface ; les suivants reçoivent le prevResult et ajoutent des capacités comme `portmap` (hostPort) et `bandwidth` (annotations kubernetes.io/ingress-bandwidth).
