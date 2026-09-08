## Question

Clients rufen eine OpenAI-artige API auf, bei der das Modell im JSON-BODY steht ({"model": "llama-3"}). Warum ist das ein Problem für klassische Gateways, und was ist die Lösung?

## Options

- Kein Problem; Gateways lesen JSON nativ
- Das Protokoll auf UDP umstellen
- NodePort verwenden
- Gateways routen nach Path/Header/SNI, nicht nach Body

## Solution

**Gateways routen nach Path/Header/SNI, nicht nach Body** ist die richtige Antwort: Klassisches Routing inspiziert keine Payloads. Die Body-Based-Routing-Extension (Envoy ext-proc im Inference Gateway) parst das JSON, hebt `model` in einen Header, und normales HTTPRoute-/InferencePool-Routing entscheidet das Ziel.
