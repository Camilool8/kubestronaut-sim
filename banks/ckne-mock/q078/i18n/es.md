## Question

Dos reglas de un HTTPRoute coinciden con la misma solicitud: una con el path /api y otra con /api/v2. ¿Cuál gana?

## Options

- Siempre la primera del YAML
- La elección es aleatoria
- Ninguna; la solicitud se rechaza con un 404
- La regla más específica: el prefijo de path más largo

## Solution

**La regla más específica: el prefijo de path más largo** es la respuesta correcta: La precedencia de Gateway API es determinista: exact > prefijo más largo y después número de headers/query params coincidentes; los empates entre HTTPRoutes favorecen al más antiguo, con orden alfabético como último desempate. Esto evita ambigüedades de enrutamiento.
