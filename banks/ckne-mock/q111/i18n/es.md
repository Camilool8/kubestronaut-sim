## Question

¿Por qué los certificados de workload del service mesh (SVID) tienen una duración corta (por ejemplo, 24 h) y se rotan automáticamente?

## Options

- Para ahorrar espacio en disco en los nodos
- Para obligar a reiniciar los pods diariamente
- Una ventana de exposición corta para certificados comprometidos, sin depender de revocación
- Porque TLS exige una caducidad de 24 h según una regla de IETF

## Solution

**Una ventana de exposición corta para certificados comprometidos, sin depender de revocación** es la respuesta correcta: Vida corta = exposición corta: un certificado filtrado vale durante horas, no años, y la revocación —históricamente problemática— deja de ser necesaria. istio-agent/SPIRE renuevan los SVID automáticamente antes de que caduquen, sin reiniciar los workloads.
