## Question

hubble observe montre des drops au verdict « Policy denied » dans le sens pod→kube-dns APRÈS l'application d'une policy egress au namespace. Les applis se plaignent de résolution de noms. La bonne lecture du flux ?

## Options

- kube-dns a changé de ports
- Le flow log confirme la cause racine
- CoreDNS a crashé, emportant la résolution
- Hubble se trompe sur ce type de flux

## Solution

**Le flow log confirme la cause racine** est la bonne réponse : Des flux DROPPED vers kube-dns:53 juste après une policy egress = la signature sans équivoque de la règle DNS oubliée (autoriser UDP/TCP 53). Hubble transforme « le DNS a mystérieusement cessé » en cause et effet visibles.
