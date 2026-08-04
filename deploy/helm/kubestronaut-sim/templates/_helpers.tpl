{{/*
Names and labels.
*/}}
{{- define "kubestronaut-sim.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubestronaut-sim.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "kubestronaut-sim.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "kubestronaut-sim.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "kubestronaut-sim.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kubestronaut-sim.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: hub
{{- end -}}

{{- define "kubestronaut-sim.serviceAccountName" -}}
{{ include "kubestronaut-sim.fullname" . }}
{{- end -}}

{{/*
Where session Pods are created. The hub can only create them where its
Role says it may, so this is one value and both places read it.
*/}}
{{- define "kubestronaut-sim.sessionNamespace" -}}
{{- .Values.sessions.namespace | default .Release.Namespace -}}
{{- end -}}

{{/*
The name of the Secret holding COOKIE_KEY and the GitHub credentials —
one this chart created, or one that was already there.
*/}}
{{- define "kubestronaut-sim.secretName" -}}
{{- if .Values.hub.existingSecret -}}
{{- .Values.hub.existingSecret -}}
{{- else -}}
{{- include "kubestronaut-sim.fullname" . -}}
{{- end -}}
{{- end -}}

{{- define "kubestronaut-sim.createSecret" -}}
{{- if .Values.hub.existingSecret -}}
{{- else if or .Values.hub.secret.cookieKey .Values.hub.secret.githubClientID .Values.hub.secret.githubClientSecret -}}
true
{{- end -}}
{{- end -}}

{{/*
One image name. Every image this chart runs is <prefix><short>:<tag> —
the seven session images plus the hub, from one release workflow.
*/}}
{{- define "kubestronaut-sim.image" -}}
{{- $ctx := .ctx -}}
{{- printf "%s%s:%s" $ctx.Values.images.prefix .name ($ctx.Values.images.tag | default $ctx.Chart.AppVersion) -}}
{{- end -}}

{{/*
kubestronaut-sim.sessionPod renders one of the Pod manifests in files/
into the JSON the hub stamps out per candidate.

The manifest is the source of truth and it is NOT a template. It is
parsed, four things are rewritten, and it is handed back:

  1. image and imagePullPolicy on every first-party container, so a
     deployment can pull a chosen release from a chosen registry;
  2. metadata.namespace, because the API server rejects a create whose
     body names a different namespace from the URL;
  3. nodeSelector and tolerations, which are placement policy and belong
     to whoever runs the cluster, not to the manifest;
  4. per-container resources, merged over what the manifest declares.

Everything else — every container, capability, volume, probe, hostAlias
and env var — survives untouched. That is the whole point: the file in
files/ is what was debugged against a real cluster, and this chart
cannot silently disagree with it.

Called with a dict: ctx (the root context), file, flavour (the
.Values.sessions.<kind> block).
*/}}
{{- define "kubestronaut-sim.sessionPod" -}}
{{- $ctx := .ctx -}}
{{- $flavour := .flavour -}}
{{- $raw := $ctx.Files.Get .file -}}
{{- if not $raw -}}
{{- fail (printf "kubestronaut-sim: the chart is missing %s" .file) -}}
{{- end -}}
{{- $pod := fromYaml $raw -}}
{{- if hasKey $pod "Error" -}}
{{- fail (printf "kubestronaut-sim: %s is not valid YAML: %v" .file (index $pod "Error")) -}}
{{- end -}}
{{- if ne (index $pod "kind") "Pod" -}}
{{- fail (printf "kubestronaut-sim: %s is a %v, want a Pod" .file (index $pod "kind")) -}}
{{- end -}}
{{- $spec := $pod.spec -}}

{{- $_ := set $pod.metadata "namespace" (include "kubestronaut-sim.sessionNamespace" $ctx) -}}

{{- $tag := $ctx.Values.images.tag | default $ctx.Chart.AppVersion -}}
{{- $rewritten := 0 -}}
{{- range $key := list "initContainers" "containers" -}}
{{- range $c := (index $spec $key | default list) -}}
{{- $repo := splitList ":" $c.image | first -}}
{{- if hasPrefix "cjoga/kubestronaut-sim-" $repo -}}
{{- $short := trimPrefix "cjoga/kubestronaut-sim-" $repo -}}
{{- $_ := set $c "image" (printf "%s%s:%s" $ctx.Values.images.prefix $short $tag) -}}
{{- $_ := set $c "imagePullPolicy" $ctx.Values.images.pullPolicy -}}
{{- $rewritten = add1 $rewritten -}}
{{- end -}}
{{- with (index ($flavour.resources | default dict) $c.name) -}}
{{- $_ := set $c "resources" (mergeOverwrite (index $c "resources" | default dict) .) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- if eq $rewritten 0 -}}
{{- fail (printf "kubestronaut-sim: no container in %s carries a first-party image, so images.prefix and images.tag would go nowhere" .file) -}}
{{- end -}}

{{- $pullSecrets := list -}}
{{- range $ctx.Values.images.pullSecrets -}}
{{- $pullSecrets = append $pullSecrets (dict "name" .) -}}
{{- end -}}
{{- if $pullSecrets -}}
{{- $_ := set $spec "imagePullSecrets" $pullSecrets -}}
{{- end -}}

{{/* Values are authoritative for placement, including when they are
     empty: `nodeSelector: {}` means "schedule this anywhere", and a
     manifest default left in place would quietly ignore it. */}}
{{- if $flavour.nodeSelector -}}
{{- $_ := set $spec "nodeSelector" $flavour.nodeSelector -}}
{{- else -}}
{{- $_ := unset $spec "nodeSelector" -}}
{{- end -}}
{{- if $flavour.tolerations -}}
{{- $_ := set $spec "tolerations" $flavour.tolerations -}}
{{- else -}}
{{- $_ := unset $spec "tolerations" -}}
{{- end -}}

{{- $pod | toJson -}}
{{- end -}}
