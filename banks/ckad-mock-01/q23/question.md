Namespace `lacerta` runs two releases of the checkout service side by
side: Deployment `checkout-blue` and Deployment `checkout-green`. Both
are healthy. Service `checkout` currently sends every request to the blue
release.

Green has passed verification. Cut the live traffic over to it:

1. Service `checkout` must send requests to the green release's Pods and
   to no others.
2. Leave `checkout-blue` running and at its current replica count. It is
   the rollback, and it stays warm until green has been watched under
   real traffic.
3. Do not delete or replace the Service, and leave it publishing port
   `80`.

Deployment `checkout-client` is in the Namespace to make requests from:

```bash
k -n lacerta exec deploy/checkout-client -- wget -q -O - http://checkout
```
