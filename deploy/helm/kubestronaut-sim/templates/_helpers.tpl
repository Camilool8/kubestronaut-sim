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

{{- define "kubestronaut-sim.sessionNamespace" -}}
{{- .Values.sessions.namespace | default .Release.Namespace -}}
{{- end -}}

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

{{- define "kubestronaut-sim.image" -}}
{{- $ctx := .ctx -}}
{{- printf "%s%s:%s" $ctx.Values.images.prefix .name ($ctx.Values.images.tag | default $ctx.Chart.AppVersion) -}}
{{- end -}}

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
