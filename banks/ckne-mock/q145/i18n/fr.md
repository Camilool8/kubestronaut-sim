## Question

Que matche une HTTPRoute déclarée SANS aucun matches ?

## Options

- Rien — matches est obligatoire
- Tout sur le(s) hostname(s)/listener
- Seulement GET /
- Seulement HTTPS

## Solution

**Tout sur le(s) hostname(s)/listener** est la bonne réponse : Sans matches explicites, `PathPrefix /` est supposé — une route catch-all. Combinée aux règles de précédence (la plus spécifique gagne), une catch-all mal placée explique bien des « pourquoi cette route a-t-elle servi ? ».
