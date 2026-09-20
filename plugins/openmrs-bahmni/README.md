# VedaMD for OpenMRS and Bahmni

**No custom VedaMD module is needed.** Bahmni already ships a generic
CDS Hooks client — [`Bahmni/openmrs-module-cdss`][cdss] — and VedaMD
speaks its protocol exactly. Installing it and pointing one global
property at the [bridge](../vedamd-cds-bridge) is the whole integration.

Writing a bespoke `.omod` would mean maintaining Java against every
OpenMRS platform bump to reimplement what this module already does.

[cdss]: https://github.com/Bahmni/openmrs-module-cdss

## What the module actually does

Verified against the module source, not its docs:

| Step | Behaviour |
|---|---|
| Bahmni UI calls | `POST /openmrs/ws/rest/v1/cdss?service={serviceId}` with a FHIR Bundle |
| Module validates | `GET {cdss.fhir.baseurl}` → expects `{ "services": [ { "id": … } ] }`, and requires `serviceId` to appear in it |
| Module posts | `POST {cdss.fhir.baseurl}/{serviceId}` |
| Body | `{ "hook": "{serviceId}", "prefetch": { "patient": Patient, "conditions": Bundle, "draftMedicationRequests": Bundle } }` |
| Expects back | `{ "cards": [ { "summary", "detail", "indicator", "source" } ] }` |

Two consequences drive the setup below:

1. **The module sends no `Authorization` header.** Its only knob is the
   base URL. So the API key has to be injected by something between it
   and VedaMD — that is what the bridge is for.
2. **`draftMedicationRequests` contains active medications too.** The
   module's `MedicationRequestBuilder` adds the patient's existing
   active orders *and* the new draft into the same bundle. VedaMD
   separates them by each resource's FHIR `status`, so interaction
   checks compare the new drug against the real current list.

## Install

Everything below comes from the downloaded package
`vedamd-openmrs-bahmni-<version>.zip`, which contains this guide,
`verify.sh`, and the bridge source in `vedamd-cds-bridge/`.

### 1. Install the CDSS module in OpenMRS

Recent Bahmni distributions already include it — check
**Administration → Manage Modules** for "CDSS" first. Otherwise build it:

```bash
git clone https://github.com/Bahmni/openmrs-module-cdss.git
cd openmrs-module-cdss && mvn clean install

cp omod/target/cdss-*.omod /opt/openmrs/modules/
systemctl restart tomcat     # or: docker compose restart openmrs
```

It requires the `webservices.rest` and `fhir2` modules.

### 2. Start the bridge

There is no published registry image — the bridge is built from the
source in this package, so you can read exactly what runs beside your EMR.

```bash
unzip vedamd-openmrs-bahmni-*.zip
cd vedamd-openmrs-bahmni/vedamd-cds-bridge
cp .env.example .env          # set VEDAMD_API_KEY
docker compose up -d --build
curl http://127.0.0.1:8088/healthz
```

The compose file binds to `127.0.0.1`. If OpenMRS runs on another host,
change the port binding to a **private** interface address. The bridge
holds your API key and must never be reachable from outside the
facility network.

### 3. Set the two global properties

**Administration → Settings → Advanced Settings** (or *Maintenance →
Global Properties*, depending on version). The module declares both:

| Property | Value | Default |
|---|---|---|
| `cdss.enable` | `true` | `false` |
| `cdss.fhir.baseurl` | `http://<bridge-host>:8088/cds-services` | `http://cdss:8080/cds-services` |

`cdss.enable` ships as **false**; the module describes it as the switch
for whether CDSS is used. The module's own Java code does not read it,
so it is consumed by the Bahmni client — leave it false and the
prescribing screen never calls CDSS at all.

`cdss.fhir.baseurl` must be the **discovery** URL. The module GETs it to
validate the service id, then appends `/{serviceId}` itself. A single
service URL here makes every call fail validation.

### 4. Grant the privilege

The module declares the privilege **Execute CDSS** and its service
method requires it. Under **Administration → Manage Roles**, add it to
the role that prescribes (typically *Provider*). Without it, calls fail
with an authorization error before any HTTP request is made.

### 5. Verify

From the OpenMRS host, so the check uses the same network path:

```bash
./verify.sh http://<bridge-host>:8088
```

It performs discovery the way the module does, then posts a
warfarin + ibuprofen order in the module's exact payload shape and
expects an interaction card back.

## Which service id to configure

| VedaMD service id | Fires when | Rules |
|---|---|---|
| `vedamd-order-select` | a drug is chosen, before signing | interactions, renal/hepatic dose, pregnancy, allergy cross-reactivity, AWaRe stewardship |
| `vedamd-order-sign` | the order is signed | same set, last-chance check |
| `vedamd-patient-view` | chart opened | screening and recognition rules |

Bahmni's prescribing screen passes `service=` on its own request, so the
id is set in the Bahmni app config, not in the module.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `CDSService X unavailable in the configured CDSS System` | `cdss.fhir.baseurl` points at a service URL instead of the discovery URL, or the bridge cannot reach VedaMD (it returns an empty service list when upstream is down) |
| `Global property 'cdss.fhir.baseurl' value is missing` | step 3 not applied, or applied to the wrong OpenMRS instance |
| The prescribing screen never calls CDSS | `cdss.enable` is still `false` |
| Calls succeed but no cards ever appear | check `GET /healthz` on the bridge: a non-zero `upstreamErrors` means a bad API key or an unreachable VedaMD |
| Cards appear for interactions but never for renal dosing | the patient has no creatinine Observation in the bundle Bahmni sends; VedaMD will not guess a renal function it was not given |
