## Question

Welchen Vorteil hat targetPort mit NAME (z. B. targetPort: http) statt Nummer?

## Options

- Es ist schneller
- Der Name referenziert die benannte containerPort jedes Pods
- Vermeidet Konflikte mit NodePort
- Portnamen sind in der Gateway API verpflichtend

## Solution

**Der Name referenziert die benannte containerPort jedes Pods** ist die richtige Antwort: Mit `targetPort: http` definiert jeder Pod `ports[].name: http` mit beliebiger Nummer (8080, 3000 …). Der Service löst pro Pod auf — nützlich bei Migrationen und Rolling Updates, die den App-Port ändern.
