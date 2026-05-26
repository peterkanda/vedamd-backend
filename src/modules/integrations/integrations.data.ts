/**
 * EMR / HMIS integration catalogue.
 *
 * Each entry describes how an external system can integrate with VedaMD,
 * with copy-paste snippets and links to deeper documentation. The data
 * is static configuration (not signed clinical content) — it changes
 * only when we add new integrations.
 */

export type IntegrationCategory = 'open-source' | 'proprietary' | 'standard';

export type IntegrationMethod =
  | 'cds-hooks'
  | 'smart-on-fhir'
  | 'fhir-rest'
  | 'rest'
  | 'hl7v2'
  | 'webhook'
  | 'iframe-embed';

export interface IntegrationSnippet {
  /** Short human label for the snippet — eg. "Add to OpenEMR globals" */
  label: string;
  /** Programming/config language for syntax highlighting */
  language: 'bash' | 'json' | 'yaml' | 'php' | 'javascript' | 'typescript' | 'python' | 'xml' | 'sql' | 'ini' | 'text';
  /** The snippet body — copy-pasteable */
  code: string;
}

export interface IntegrationLink {
  label: string;
  url: string;
  kind: 'docs' | 'plugin' | 'github' | 'video' | 'sandbox';
}

export interface IntegrationSummary {
  slug: string;
  name: string;
  category: IntegrationCategory;
  /** Short blurb shown on the catalogue card */
  tagline: string;
  /** Primary integration method */
  primaryMethod: IntegrationMethod;
  /** All methods supported */
  methods: IntegrationMethod[];
  /** SSA / global relevance tags */
  tags: string[];
}

export interface Integration extends IntegrationSummary {
  /** Longer description shown on the detail view */
  description: string;
  /** Official website */
  homepage: string;
  /** Supported CDS Hooks (if applicable) */
  supportedHooks?: string[];
  /** Configuration / code snippets */
  snippets: IntegrationSnippet[];
  /** Links — docs, plugin downloads, GitHub, etc. */
  links: IntegrationLink[];
  /** Practical notes for integrators */
  notes?: string[];
}

const VEDAMD_BASE_URL_PLACEHOLDER = 'https://api.vedamd.io';
const VEDAMD_HOOK_DISCOVERY = `${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services`;

export const INTEGRATIONS: Integration[] = [
  // ---------- Open-source EMR / HMIS ----------
  {
    slug: 'openmrs',
    name: 'OpenMRS',
    category: 'open-source',
    tagline:
      'Open-source EMR platform used by Kenya MOH (KenyaEMR), Mozambique, Rwanda, Uganda and many SSA programmes for HIV / TB / MCH.',
    description:
      'OpenMRS is the most widely deployed open-source EMR in sub-Saharan Africa. The FHIR2 module exposes patient context as FHIR R4 resources, which can be forwarded to VedaMD CDS Hooks endpoints. The REST Web Services module gives direct API access for custom integrations.',
    homepage: 'https://openmrs.org',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks', 'fhir-rest', 'rest'],
    tags: ['ssa', 'hiv', 'tb', 'mch', 'kenya'],
    supportedHooks: ['patient-view', 'medication-prescribe', 'order-select', 'order-sign'],
    snippets: [
      {
        label: 'Install the OpenMRS CDS Hooks module',
        language: 'bash',
        code: `# Drop the cdshooks-omod into the OpenMRS modules directory
cp openmrs-module-cdshooks-1.0.0.omod /opt/openmrs/modules/

# Restart the OpenMRS server (Tomcat)
systemctl restart tomcat`,
      },
      {
        label: 'Register VedaMD service in OpenMRS Administration → CDS Hooks',
        language: 'json',
        code: `{
  "hook": "patient-view",
  "title": "VedaMD safety checks",
  "id": "vedamd-patient-view",
  "url": "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view",
  "authToken": "vmd_test_..."
}`,
      },
      {
        label: 'Or invoke from the OpenMRS FHIR2 module via fhir.r4',
        language: 'bash',
        code: `curl -X POST "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view" \\
  -H "Authorization: Bearer vmd_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "hook": "patient-view",
    "hookInstance": "uuid-here",
    "fhirServer": "https://your-openmrs/ws/fhir2/R4",
    "context": { "patientId": "FHIR-patient-uuid" }
  }'`,
      },
    ],
    links: [
      { label: 'OpenMRS documentation', url: 'https://wiki.openmrs.org', kind: 'docs' },
      { label: 'OpenMRS FHIR2 module', url: 'https://github.com/openmrs/openmrs-module-fhir2', kind: 'github' },
      { label: 'OpenMRS REST Web Services', url: 'https://rest.openmrs.org/', kind: 'docs' },
      { label: 'KenyaEMR distribution', url: 'https://github.com/palladiumkenya', kind: 'github' },
    ],
    notes: [
      'The FHIR2 module ships with OpenMRS Reference Application 2.10+',
      'For KenyaEMR / IQCare distributions, confirm the FHIR2 module version supports the resources you need (Patient, MedicationRequest, Encounter, Observation).',
      'Use a per-environment sandbox key (vmd_test_...) for staging; production keys (vmd_live_...) require your tenant to be approved.',
    ],
  },
  {
    slug: 'openemr',
    name: 'OpenEMR',
    category: 'open-source',
    tagline: 'Globally deployed open-source ambulatory EHR with native FHIR R4 + SMART on FHIR + CDS Hooks support.',
    description:
      'OpenEMR is the most-deployed open-source ambulatory EMR. Recent versions (7.0+) ship with a FHIR R4 endpoint, SMART on FHIR launch context, and a built-in CDS Hooks consumer. Globals → Connectors → CDS Hooks lets administrators paste a discovery URL to register VedaMD services.',
    homepage: 'https://www.open-emr.org',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks', 'smart-on-fhir', 'fhir-rest'],
    tags: ['ambulatory', 'global', 'ssa'],
    supportedHooks: ['patient-view', 'medication-prescribe', 'order-select', 'order-sign', 'encounter-discharge'],
    snippets: [
      {
        label: 'Register VedaMD discovery in OpenEMR Admin → Globals → Connectors',
        language: 'text',
        code: `CDS Hooks discovery endpoint:
${VEDAMD_HOOK_DISCOVERY}

Authorization header:
Bearer vmd_test_...`,
      },
      {
        label: 'OpenEMR SMART app registration (Admin → System → API Clients)',
        language: 'json',
        code: `{
  "client_name": "VedaMD Decision Support",
  "redirect_uri": "${VEDAMD_BASE_URL_PLACEHOLDER}/smart/callback",
  "scope": "launch openid fhirUser patient/*.read"
}`,
      },
      {
        label: 'Call CDS Hooks from OpenEMR via cURL (test)',
        language: 'bash',
        code: `curl -X POST "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-medication-prescribe" \\
  -H "Authorization: Bearer vmd_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "hookInstance": "01HVZ...",
    "hook": "medication-prescribe",
    "fhirServer": "https://your-openemr/apis/default/fhir",
    "context": {
      "patientId": "1",
      "encounterId": "5",
      "medications": { "resourceType": "Bundle", "entry": [] }
    }
  }'`,
      },
    ],
    links: [
      { label: 'OpenEMR documentation', url: 'https://www.open-emr.org/wiki/', kind: 'docs' },
      { label: 'OpenEMR FHIR API guide', url: 'https://github.com/openemr/openemr/blob/master/API_README.md', kind: 'docs' },
      { label: 'OpenEMR GitHub', url: 'https://github.com/openemr/openemr', kind: 'github' },
    ],
    notes: [
      'OpenEMR ≥ 7.0 ships with FHIR R4 + SMART. Older versions need the API module enabled in Admin → Globals.',
      'CDS Hooks responses render as cards in the OpenEMR encounter sidebar; override-reason capture is supported.',
    ],
  },
  {
    slug: 'bahmni',
    name: 'Bahmni',
    category: 'open-source',
    tagline:
      'Distribution combining OpenMRS (clinical) + ERPNext (admin/billing) + OpenELIS (lab) + OpenImaging — widely deployed across SSA + India.',
    description:
      'Bahmni stitches OpenMRS, ERPNext and OpenELIS into a single deployment. VedaMD integrates via the underlying OpenMRS REST + FHIR2 module — see the OpenMRS integration for details — and can additionally consume ERPNext webhooks for billing-side events.',
    homepage: 'https://www.bahmni.org',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks', 'fhir-rest', 'rest', 'webhook'],
    tags: ['ssa', 'india', 'hospital'],
    snippets: [
      {
        label: 'Bahmni docker stack — add VedaMD CDS Hooks endpoint to OpenMRS config',
        language: 'yaml',
        code: `# bahmni_docker/openmrs/config/cds_hooks_services.json
services:
  - id: vedamd-patient-view
    hook: patient-view
    url: ${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view
    auth_token: vmd_test_...`,
      },
      {
        label: 'Restart Bahmni stack after config change',
        language: 'bash',
        code: `cd bahmni_docker
docker compose restart openmrs proxy`,
      },
    ],
    links: [
      { label: 'Bahmni documentation', url: 'https://bahmni.atlassian.net/wiki/spaces/BAH/overview', kind: 'docs' },
      { label: 'Bahmni GitHub', url: 'https://github.com/Bahmni', kind: 'github' },
      { label: 'Bahmni Docker', url: 'https://github.com/Bahmni/bahmni-docker', kind: 'github' },
    ],
    notes: [
      'Bahmni 0.93+ supports OpenMRS FHIR2 — use it for VedaMD CDS Hooks integration.',
      'For lab-derived rules (creatinine → renal dosing) consume OpenELIS results through the OpenMRS observation pipeline.',
    ],
  },
  {
    slug: 'erpnext-frappe-healthcare',
    name: 'ERPNext / Frappe Healthcare',
    category: 'open-source',
    tagline: 'Frappe Healthcare ships ERPNext clinical workflows + REST + webhook hooks — popular in India and emerging in SSA.',
    description:
      'Frappe Healthcare layers patient, encounter, lab, vaccination and clinical-procedure DocTypes on top of ERPNext. Server Scripts and Webhooks can call VedaMD CDS Hooks endpoints when an encounter or prescription is saved.',
    homepage: 'https://frappe.io/health',
    primaryMethod: 'webhook',
    methods: ['webhook', 'rest', 'cds-hooks'],
    tags: ['ambulatory', 'hospital', 'india', 'ssa'],
    snippets: [
      {
        label: 'Frappe Server Script — call VedaMD on Patient Encounter save',
        language: 'python',
        code: `# DocType: Patient Encounter, Event: After Save
import frappe, requests

def call_vedamd(doc, method):
    payload = {
        "hookInstance": frappe.generate_hash(length=20),
        "hook": "patient-view",
        "context": {
            "patientId": doc.patient,
            "encounterId": doc.name,
        },
    }
    r = requests.post(
        "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view",
        json=payload,
        headers={"Authorization": "Bearer vmd_test_..."},
        timeout=4,
    )
    if r.ok:
        cards = r.json().get("cards", [])
        for c in cards:
            frappe.publish_realtime("vedamd_card", {"summary": c.get("summary"), "detail": c.get("detail")})`,
      },
      {
        label: 'Or add a Frappe Webhook (no code)',
        language: 'json',
        code: `{
  "doctype": "Patient Encounter",
  "webhook_url": "${VEDAMD_BASE_URL_PLACEHOLDER}/integrations/erpnext/patient-encounter",
  "webhook_headers": [
    { "key": "Authorization", "value": "Bearer vmd_test_..." }
  ],
  "webhook_data": [
    { "fieldname": "patient", "key": "patient_id" },
    { "fieldname": "name", "key": "encounter_id" }
  ]
}`,
      },
    ],
    links: [
      { label: 'Frappe Healthcare docs', url: 'https://docs.frappe.io/healthcare', kind: 'docs' },
      { label: 'ERPNext Server Scripts', url: 'https://docs.erpnext.com/docs/user/manual/en/server-script', kind: 'docs' },
      { label: 'Frappe Healthcare GitHub', url: 'https://github.com/frappe/health', kind: 'github' },
    ],
    notes: [
      'Use Server Scripts for synchronous decision support; Webhooks for fire-and-forget audit/logging.',
      'Frappe Health 14+ supports the FHIR DocType for round-trip exchange.',
    ],
  },
  {
    slug: 'gnu-health',
    name: 'GNU Health',
    category: 'open-source',
    tagline: 'GNU Project hospital information system — strong in LATAM, growing in SSA — exposes XML-RPC + REST + FHIR.',
    description:
      'GNU Health is a hospital + lab + public health information system built on the Tryton ERP. It exposes XML-RPC, REST and (recently) FHIR. VedaMD integrates via webhooks fired from Tryton workflow events or via FHIR R4 PUSH.',
    homepage: 'https://www.gnuhealth.org',
    primaryMethod: 'fhir-rest',
    methods: ['fhir-rest', 'rest', 'webhook'],
    tags: ['latam', 'public-health', 'ssa'],
    snippets: [
      {
        label: 'Tryton model rule — POST to VedaMD on prescription create',
        language: 'python',
        code: `# trytond_module_vedamd_bridge/prescription.py
from trytond.model import ModelView
from trytond.transaction import Transaction
import requests, json

class PrescriptionOrder(metaclass=PoolMeta):
    __name__ = 'gnuhealth.prescription.order'

    @classmethod
    def create(cls, vlist):
        records = super().create(vlist)
        for r in records:
            requests.post(
                '${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-medication-prescribe',
                json={'hook': 'medication-prescribe',
                      'hookInstance': str(r.id),
                      'context': {'patientId': r.patient.id, 'medications': [m.medicament.name for m in r.prescription_line]}},
                headers={'Authorization': 'Bearer vmd_test_...'},
                timeout=4)
        return records`,
      },
    ],
    links: [
      { label: 'GNU Health documentation', url: 'https://docs.gnuhealth.org', kind: 'docs' },
      { label: 'GNU Health Savannah', url: 'https://savannah.gnu.org/projects/health/', kind: 'github' },
    ],
    notes: [
      'GNU Health 4.4+ supports FHIR R4 via the health_fhir module.',
      'Bridge modules can be packaged as Tryton modules and installed alongside core.',
    ],
  },
  {
    slug: 'dhis2',
    name: 'DHIS2',
    category: 'open-source',
    tagline:
      'District Health Information System — backbone of national HMIS in Kenya (KHIS), Uganda, Tanzania, Rwanda and 80+ countries.',
    description:
      'DHIS2 is the largest health information system in the world, used as national HMIS by 80+ countries including Kenya (KHIS), Tanzania (HMIS), Uganda (HMIS2). VedaMD integrates via the Tracker API for individual-level workflows and via Web App + iframe embed for analytics dashboards.',
    homepage: 'https://dhis2.org',
    primaryMethod: 'rest',
    methods: ['rest', 'webhook', 'iframe-embed'],
    tags: ['national-hmis', 'ssa', 'kenya', 'public-health'],
    snippets: [
      {
        label: 'Call VedaMD from a DHIS2 Tracker program rule',
        language: 'javascript',
        code: `// DHIS2 → Programs → Program rules → "VedaMD safety check"
// Action: "Send message to URL"
var payload = {
  hook: 'patient-view',
  hookInstance: V{event_uid},
  context: {
    patientId: V{tracked_entity_instance},
    medications: A{drug_regimen}
  }
};

WS.post(
  '${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view',
  payload,
  { 'Authorization': 'Bearer vmd_test_...' }
);`,
      },
      {
        label: 'Embed VedaMD Catalogue inside a DHIS2 dashboard',
        language: 'xml',
        code: `<iframe
  src="https://app.vedamd.io/app/catalogue?embed=1&theme=light"
  width="100%"
  height="600"
  frameborder="0"
  sandbox="allow-scripts allow-same-origin"
></iframe>`,
      },
    ],
    links: [
      { label: 'DHIS2 documentation', url: 'https://docs.dhis2.org', kind: 'docs' },
      { label: 'DHIS2 Web API', url: 'https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/introduction.html', kind: 'docs' },
      { label: 'Kenya KHIS', url: 'https://hiskenya.org', kind: 'docs' },
    ],
    notes: [
      'Kenya KHIS / KePMs is a DHIS2 deployment — county-level integration follows the same pattern.',
      'For aggregate analytics, push pre-computed indicators to DHIS2 data sets; for individual decisions, use Tracker.',
    ],
  },
  {
    slug: 'openhim',
    name: 'OpenHIM',
    category: 'open-source',
    tagline: 'Open Health Information Mediator — the OpenHIE backbone routing between facility EMRs and national registries.',
    description:
      'OpenHIM is a request mediator that sits between point-of-care systems (OpenMRS, OpenEMR, Bahmni) and shared services (SHR, CR, FR, PLR, terminology). VedaMD can be added as a routing channel — any HL7v2 / FHIR / REST traffic matching a route is mediated to the VedaMD CDS endpoint and the response is funnelled back.',
    homepage: 'https://openhim.org',
    primaryMethod: 'fhir-rest',
    methods: ['fhir-rest', 'hl7v2', 'rest'],
    tags: ['interop', 'openhie', 'ssa'],
    snippets: [
      {
        label: 'OpenHIM channel definition — route /cds-services/* to VedaMD',
        language: 'json',
        code: `{
  "name": "VedaMD CDS Hooks",
  "urlPattern": "^/cds-services/.*$",
  "routes": [{
    "name": "vedamd-primary",
    "host": "api.vedamd.io",
    "port": 443,
    "secured": true,
    "primary": true,
    "type": "http",
    "forwardAuthHeader": true
  }],
  "allow": ["facility-emr", "shr"],
  "authType": "private",
  "matchContentTypes": ["application/json"]
}`,
      },
    ],
    links: [
      { label: 'OpenHIM documentation', url: 'https://openhim.org/docs/introduction/about', kind: 'docs' },
      { label: 'OpenHIE Architecture', url: 'https://wiki.ohie.org', kind: 'docs' },
    ],
    notes: [
      'Place OpenHIM in front of VedaMD when you need a single audit point for multiple downstream EMRs.',
      'OpenHIM ↔ Instant OpenHIE makes deployment one-command for prototype clusters.',
    ],
  },
  {
    slug: 'commcare',
    name: 'CommCare',
    category: 'open-source',
    tagline: "Dimagi's open-source mobile platform for community health workers — widely used in SSA and South Asia.",
    description:
      "CommCare apps can call external services from forms via Form Submission Triggers. VedaMD CDS Hooks endpoints return cards usable inline in CommCare's display modules.",
    homepage: 'https://www.commcarehq.org',
    primaryMethod: 'webhook',
    methods: ['webhook', 'rest'],
    tags: ['chw', 'ssa', 'mobile'],
    snippets: [
      {
        label: 'CommCare Form Submission Trigger → VedaMD',
        language: 'json',
        code: `{
  "name": "VedaMD safety check",
  "form_xmlns": "http://commcarehq.org/forms/anc_visit",
  "trigger_url": "${VEDAMD_BASE_URL_PLACEHOLDER}/integrations/commcare/form-submit",
  "headers": {
    "Authorization": "Bearer vmd_test_..."
  },
  "payload_template": {
    "form": "{xml}",
    "case_id": "{case_id}"
  }
}`,
      },
    ],
    links: [
      { label: 'CommCare HQ documentation', url: 'https://confluence.dimagi.com', kind: 'docs' },
      { label: 'CommCare Data Forwarding', url: 'https://confluence.dimagi.com/display/commcarepublic/Data+Forwarding', kind: 'docs' },
    ],
    notes: [
      'CommCare Supply / CommCare Reports can be combined with VedaMD recommendations for CHW workflows.',
    ],
  },

  // ---------- Proprietary EMR (FHIR-supported) ----------
  {
    slug: 'epic',
    name: 'Epic',
    category: 'proprietary',
    tagline: 'Largest enterprise EMR — SMART on FHIR + CDS Hooks supported via App Orchard / Showroom.',
    description:
      "Epic supports CDS Hooks 1.0 and SMART on FHIR launch context. Vendors register through Epic's App Orchard / Showroom programme. VedaMD's CDS Hooks discovery endpoint is the integration entry point.",
    homepage: 'https://www.epic.com',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks', 'smart-on-fhir', 'fhir-rest'],
    tags: ['enterprise', 'us', 'global'],
    supportedHooks: ['patient-view', 'order-select', 'order-sign', 'appointment-book'],
    snippets: [
      {
        label: 'Register VedaMD in Epic CDS Hooks Configuration (Hyperspace → Chart Review)',
        language: 'text',
        code: `Discovery URL: ${VEDAMD_HOOK_DISCOVERY}
Authentication: OAuth2 Client Credentials
Token URL: ${VEDAMD_BASE_URL_PLACEHOLDER}/oauth2/token
Client ID: <your epic-issued client id>
Scopes: cds:evaluate`,
      },
      {
        label: 'Epic SMART on FHIR app launch URL',
        language: 'text',
        code: `https://app.vedamd.io/smart/launch?iss=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4&launch={launch-token}`,
      },
    ],
    links: [
      { label: 'Epic App Orchard / Showroom', url: 'https://apporchard.epic.com', kind: 'docs' },
      { label: 'Epic on FHIR', url: 'https://fhir.epic.com', kind: 'sandbox' },
    ],
    notes: [
      "VedaMD listing on Epic Showroom is a separate vendor-onboarding process — contact your Epic account manager.",
      "Sandbox testing at https://fhir.epic.com requires Epic developer registration.",
    ],
  },
  {
    slug: 'cerner-oracle-health',
    name: 'Cerner / Oracle Health',
    category: 'proprietary',
    tagline: 'Cerner Millennium (now Oracle Health) — CDS Hooks + SMART on FHIR via code (formerly Cerner Open Developer Experience).',
    description:
      'Oracle Health (formerly Cerner) supports CDS Hooks 1.0 and SMART on FHIR through its code developer platform. VedaMD integrates via the same CDS Hooks discovery endpoint as Epic; production deployment requires Oracle code registration.',
    homepage: 'https://www.oracle.com/health/',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks', 'smart-on-fhir', 'fhir-rest'],
    tags: ['enterprise', 'us', 'global'],
    supportedHooks: ['patient-view', 'order-select', 'order-sign'],
    snippets: [
      {
        label: 'Register VedaMD in Oracle Health code',
        language: 'text',
        code: `1. Sign in to https://code.cerner.com
2. Create a new "CDS Hooks Service" entry
3. Discovery URL: ${VEDAMD_HOOK_DISCOVERY}
4. Authentication: OAuth2 Client Credentials
5. Token URL: ${VEDAMD_BASE_URL_PLACEHOLDER}/oauth2/token`,
      },
    ],
    links: [
      { label: 'Oracle Health code developer', url: 'https://code.cerner.com', kind: 'docs' },
      { label: 'Oracle Health FHIR R4 sandbox', url: 'https://fhir.cerner.com', kind: 'sandbox' },
    ],
    notes: [
      'Live production access requires partnership with Oracle Health and the health system.',
    ],
  },
  {
    slug: 'allscripts-veradigm',
    name: 'Allscripts / Veradigm',
    category: 'proprietary',
    tagline: 'Allscripts (now Veradigm) supports FHIR R4 + the Allscripts Developer Program for CDS Hooks.',
    description:
      'Veradigm exposes FHIR R4 for Patient, Encounter, MedicationRequest, Observation, AllergyIntolerance. CDS Hooks support is available via the Allscripts Developer Program.',
    homepage: 'https://veradigm.com',
    primaryMethod: 'fhir-rest',
    methods: ['fhir-rest', 'smart-on-fhir', 'cds-hooks'],
    tags: ['ambulatory', 'us'],
    snippets: [
      {
        label: 'Veradigm FHIR R4 — fetch MedicationRequest then evaluate via VedaMD',
        language: 'bash',
        code: `# 1. Fetch active medications from Veradigm FHIR
curl "https://fhir.veradigm.com/r4/MedicationRequest?patient=$PATIENT_ID&status=active" \\
  -H "Authorization: Bearer $VERADIGM_TOKEN"

# 2. Forward to VedaMD CDS Hooks
curl -X POST "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view" \\
  -H "Authorization: Bearer vmd_test_..." \\
  -H "Content-Type: application/json" \\
  -d @cds-payload.json`,
      },
    ],
    links: [
      { label: 'Allscripts Developer Program', url: 'https://developer.veradigm.com', kind: 'docs' },
    ],
  },
  {
    slug: 'athenahealth',
    name: 'Athenahealth',
    category: 'proprietary',
    tagline: 'Athenahealth — FHIR R4 + CDS Hooks via the More Disruption Please (MDP) developer programme.',
    description:
      'Athenahealth exposes FHIR R4 and CDS Hooks through the MDP developer programme. SMART on FHIR is supported.',
    homepage: 'https://www.athenahealth.com',
    primaryMethod: 'fhir-rest',
    methods: ['fhir-rest', 'cds-hooks', 'smart-on-fhir'],
    tags: ['ambulatory', 'us'],
    snippets: [
      {
        label: 'Register VedaMD via athenahealth Marketplace',
        language: 'text',
        code: `1. Submit application at https://developerportal.athenahealth.com
2. Once approved, add VedaMD discovery URL:
   ${VEDAMD_HOOK_DISCOVERY}
3. Configure OAuth2 client credentials from the developer portal.`,
      },
    ],
    links: [
      { label: 'athenahealth Developer Portal', url: 'https://developerportal.athenahealth.com', kind: 'docs' },
    ],
  },

  // ---------- Pure-standard integrations ----------
  {
    slug: 'hl7v2',
    name: 'HL7 v2',
    category: 'standard',
    tagline: 'Legacy but ubiquitous — ADT, ORU, ORM, MDM, SIU messages still drive most hospital interfaces.',
    description:
      "HL7 v2 remains the workhorse interface standard. VedaMD does not natively parse HL7 v2 — it speaks FHIR and CDS Hooks — but the OpenHIM mediator (or Mirth Connect / Iguana / Rhapsody) can transform incoming HL7 v2 messages to FHIR resources and call VedaMD.",
    homepage: 'https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185',
    primaryMethod: 'hl7v2',
    methods: ['hl7v2'],
    tags: ['legacy', 'global'],
    snippets: [
      {
        label: 'Mirth Connect channel — transform ADT_A04 → FHIR Patient → VedaMD',
        language: 'javascript',
        code: `// Transformer: HL7v2 ADT^A04 → FHIR R4 Patient
var patient = {
  resourceType: 'Patient',
  identifier: [{
    system: 'urn:oid:' + msg['MSH']['MSH.4']['MSH.4.1'].toString(),
    value: msg['PID']['PID.3']['PID.3.1'].toString()
  }],
  name: [{
    family: msg['PID']['PID.5']['PID.5.1'].toString(),
    given: [msg['PID']['PID.5']['PID.5.2'].toString()]
  }],
  gender: msg['PID']['PID.8'].toString().toLowerCase(),
  birthDate: msg['PID']['PID.7']['PID.7.1'].toString()
};

// Destination: HTTP Sender → VedaMD CDS Hooks
$('vedamd_payload', JSON.stringify({
  hook: 'patient-view',
  hookInstance: UUIDGenerator.getUUID(),
  context: { patientId: patient.identifier[0].value }
}));`,
      },
    ],
    links: [
      { label: 'HL7 v2 specifications', url: 'https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185', kind: 'docs' },
      { label: 'Mirth Connect (NextGen Connect)', url: 'https://www.nextgen.com/products-and-services/integration-engine', kind: 'docs' },
      { label: 'HAPI HL7 v2 (Java)', url: 'https://hapifhir.github.io/hapi-hl7v2/', kind: 'github' },
    ],
    notes: [
      'For Kenya KePMs / facility deployments still on HL7 v2, place Mirth Connect or OpenHIM between the legacy EMR and VedaMD.',
    ],
  },
  {
    slug: 'fhir-r4',
    name: 'FHIR R4',
    category: 'standard',
    tagline: 'Native — VedaMD speaks FHIR R4 directly for Patient, MedicationRequest, Condition, Observation, AllergyIntolerance.',
    description:
      "FHIR R4 is the modern interoperability standard and what VedaMD speaks natively. Send a FHIR Bundle in the CDS Hooks context.prefetch or context.medications field and we'll evaluate without further translation.",
    homepage: 'https://www.hl7.org/fhir/R4',
    primaryMethod: 'fhir-rest',
    methods: ['fhir-rest'],
    tags: ['standard', 'global'],
    snippets: [
      {
        label: 'CDS Hooks request with FHIR R4 prefetch',
        language: 'json',
        code: `{
  "hook": "patient-view",
  "hookInstance": "uuid-here",
  "fhirServer": "https://fhir.example/r4",
  "context": { "patientId": "1234" },
  "prefetch": {
    "patient": { "resourceType": "Patient", "id": "1234", "birthDate": "1985-06-01", "gender": "female" },
    "medications": { "resourceType": "Bundle", "entry": [
      { "resource": { "resourceType": "MedicationRequest", "status": "active",
          "medicationCodeableConcept": { "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "29046" }] }
      }}
    ]}
  }
}`,
      },
    ],
    links: [
      { label: 'FHIR R4 specification', url: 'https://www.hl7.org/fhir/R4', kind: 'docs' },
      { label: 'HAPI FHIR (server + client)', url: 'https://hapifhir.io', kind: 'github' },
    ],
  },
  {
    slug: 'cds-hooks',
    name: 'CDS Hooks 1.0',
    category: 'standard',
    tagline: 'The native interface — every VedaMD decision support service speaks CDS Hooks 1.0+.',
    description:
      'CDS Hooks 1.0 is the standard for invoking external decision support from inside an EMR workflow. VedaMD exposes a discovery endpoint listing all services + hooks (patient-view, medication-prescribe, order-select, order-sign, etc.).',
    homepage: 'https://cds-hooks.org',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks'],
    tags: ['standard', 'global'],
    supportedHooks: ['patient-view', 'medication-prescribe', 'order-select', 'order-sign', 'encounter-discharge', 'appointment-book'],
    snippets: [
      {
        label: 'Discover available VedaMD CDS services',
        language: 'bash',
        code: `curl ${VEDAMD_HOOK_DISCOVERY} \\
  -H "Authorization: Bearer vmd_test_..."`,
      },
      {
        label: 'Minimal patient-view invocation',
        language: 'bash',
        code: `curl -X POST "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view" \\
  -H "Authorization: Bearer vmd_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "hook": "patient-view", "hookInstance": "uuid", "context": { "patientId": "1" } }'`,
      },
    ],
    links: [
      { label: 'CDS Hooks 1.0 specification', url: 'https://cds-hooks.org/specification/1.0/', kind: 'docs' },
      { label: 'CDS Hooks sandbox', url: 'https://sandbox.cds-hooks.org', kind: 'sandbox' },
    ],
  },
  {
    slug: 'smart-on-fhir',
    name: 'SMART on FHIR',
    category: 'standard',
    tagline: 'Launch VedaMD as an embedded app inside an EMR using SMART on FHIR OAuth2.',
    description:
      "SMART on FHIR provides the OAuth2 + FHIR context standard for embedded apps. VedaMD supports both EHR-launch (the EMR sends a launch context) and standalone-launch.",
    homepage: 'https://hl7.org/fhir/smart-app-launch/',
    primaryMethod: 'smart-on-fhir',
    methods: ['smart-on-fhir'],
    tags: ['standard', 'embed', 'oauth2'],
    snippets: [
      {
        label: 'SMART app launch URL pattern',
        language: 'text',
        code: `Launch:    https://app.vedamd.io/smart/launch?iss={fhir-server-url}&launch={launch-token}
Redirect:  https://app.vedamd.io/smart/callback
Scopes:    launch openid fhirUser patient/*.read`,
      },
      {
        label: 'Decode the launch context server-side',
        language: 'typescript',
        code: `import { FHIR } from 'fhirclient';

FHIR.oauth2.ready().then(client => {
  return client.patient.read();
}).then(patient => {
  // Forward to VedaMD CDS Hooks with patient context
  fetch('${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer vmd_test_...', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook: 'patient-view',
      hookInstance: crypto.randomUUID(),
      context: { patientId: patient.id },
      prefetch: { patient }
    })
  });
});`,
      },
    ],
    links: [
      { label: 'SMART App Launch IG', url: 'https://hl7.org/fhir/smart-app-launch/', kind: 'docs' },
      { label: 'fhirclient (JS)', url: 'https://github.com/smart-on-fhir/client-js', kind: 'github' },
      { label: 'SMART Health IT sandbox', url: 'https://launch.smarthealthit.org', kind: 'sandbox' },
    ],
  },
];
