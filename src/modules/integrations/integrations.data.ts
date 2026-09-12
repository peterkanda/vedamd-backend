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
  language:
    | 'bash'
    | 'json'
    | 'yaml'
    | 'php'
    | 'javascript'
    | 'typescript'
    | 'python'
    | 'xml'
    | 'sql'
    | 'ini'
    | 'text';
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
      'OpenMRS is the most widely deployed open-source EMR in sub-Saharan Africa. Integration uses the Bahmni CDSS module (openmrs-module-cdss), a generic CDS Hooks client whose protocol VedaMD implements exactly — no VedaMD-specific .omod is required. The module posts a FHIR prefetch bundle (patient, conditions, draftMedicationRequests) and renders the returned cards. Because it sends no Authorization header, deploy the VedaMD CDS bridge alongside it to inject your API key.',
    homepage: 'https://openmrs.org',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks', 'fhir-rest', 'rest'],
    tags: ['ssa', 'hiv', 'tb', 'mch', 'kenya'],
    supportedHooks: ['patient-view', 'medication-prescribe', 'order-select', 'order-sign'],
    snippets: [
      {
        label: 'Install the Bahmni CDSS module',
        language: 'bash',
        code: `# Build the generic CDS Hooks client module
git clone https://github.com/Bahmni/openmrs-module-cdss.git
cd openmrs-module-cdss && mvn clean install

cp omod/target/cdss-*.omod /opt/openmrs/modules/
systemctl restart tomcat`,
      },
      {
        label: 'Run the VedaMD CDS bridge (the module cannot send an API key)',
        language: 'bash',
        code: `docker run -d --name vedamd-bridge --restart unless-stopped \\
  -e VEDAMD_API_KEY=vmd_live_xxxxxxxx \\
  -e VEDAMD_BASE_URL=${VEDAMD_BASE_URL_PLACEHOLDER} \\
  -p 127.0.0.1:8088:8088 \\
  vedamd/cds-bridge:0.1.0`,
      },
      {
        label: 'Point OpenMRS at the bridge (global property cdss.fhir.baseurl)',
        language: 'bash',
        code: `# Must be the DISCOVERY url — the module appends /{serviceId} itself
curl -u admin:Admin123 -X POST \\
  "https://your-openmrs/openmrs/ws/rest/v1/systemsetting/cdss.fhir.baseurl" \\
  -H 'Content-Type: application/json' \\
  -d '{"value": "http://vedamd-bridge:8088/cds-services"}'

# Then grant the "Execute CDSS" privilege to the prescribing role.`,
      },
      {
        label: 'Payload the module sends (for reference)',
        language: 'json',
        code: `{
  "hook": "vedamd-order-select",
  "prefetch": {
    "patient": { "resourceType": "Patient", "gender": "female", "birthDate": "1958-06-01" },
    "conditions": { "resourceType": "Bundle", "entry": [] },
    "draftMedicationRequests": { "resourceType": "Bundle", "entry": [] }
  }
}`,
      },
    ],
    links: [
      { label: 'OpenMRS documentation', url: 'https://wiki.openmrs.org', kind: 'docs' },
      {
        label: 'Bahmni CDSS module (the CDS Hooks client)',
        url: 'https://github.com/Bahmni/openmrs-module-cdss',
        kind: 'plugin',
      },
      {
        label: 'VedaMD OpenMRS/Bahmni setup guide',
        url: 'https://github.com/vedamd/plugins/tree/main/openmrs-bahmni',
        kind: 'plugin',
      },
      {
        label: 'OpenMRS FHIR2 module',
        url: 'https://github.com/openmrs/openmrs-module-fhir2',
        kind: 'github',
      },
      { label: 'OpenMRS REST Web Services', url: 'https://rest.openmrs.org/', kind: 'docs' },
      { label: 'KenyaEMR distribution', url: 'https://github.com/palladiumkenya', kind: 'github' },
    ],
    notes: [
      'There is no VedaMD-specific OpenMRS module and none is needed — openmrs-module-cdss is a generic CDS Hooks client and VedaMD speaks its protocol.',
      'cdss.fhir.baseurl must be the DISCOVERY url (…/cds-services). The module GETs it to validate the service id, then POSTs to …/cds-services/{serviceId}.',
      'The module sends no Authorization header, so VedaMD cannot be called directly — route it through the VedaMD CDS bridge, an nginx header injection, or OpenHIM.',
      'draftMedicationRequests contains the patient\u2019s ACTIVE medications as well as the new draft; VedaMD separates them by each resource\u2019s FHIR status.',
      'Requires the "Execute CDSS" privilege on the prescribing role, and the FHIR2 module (ships with Reference Application 2.10+).',
      'Use a per-environment sandbox key (vmd_test_...) for staging; production keys (vmd_live_...) require your tenant to be approved.',
    ],
  },
  {
    slug: 'openemr',
    name: 'OpenEMR',
    category: 'open-source',
    tagline:
      'Globally deployed open-source ambulatory EHR with FHIR R4 + SMART on FHIR. Integrates via the VedaMD PHP module.',
    description:
      'OpenEMR is the most-deployed open-source ambulatory EMR. It has no CDS Hooks client — its Clinical Decision Rules (CDR) engine evaluates local database rules, not remote services — so VedaMD ships a PHP module that reads the chart, calls VedaMD, and renders safety cards on the patient summary. OpenEMR 7.0+ also exposes FHIR R4 and SMART on FHIR for outbound data.',
    homepage: 'https://www.open-emr.org',
    primaryMethod: 'rest',
    methods: ['rest', 'smart-on-fhir', 'fhir-rest'],
    tags: ['ambulatory', 'global', 'ssa'],
    snippets: [
      {
        label: 'Install the VedaMD module',
        language: 'bash',
        code: `cd /var/www/openemr/interface/modules/custom_modules
git clone https://github.com/vedamd/oe-module-vedamd-cds.git

# Then: Administration → Modules → Manage Modules
#       → Register → Install → Enable`,
      },
      {
        label: 'Configure (environment variables take precedence over globals)',
        language: 'bash',
        code: `VEDAMD_API_KEY=vmd_live_xxxxxxxx
VEDAMD_BASE_URL=${VEDAMD_BASE_URL_PLACEHOLDER}
VEDAMD_SERVICE_ID=vedamd-patient-view
VEDAMD_TIMEOUT_SECONDS=4`,
      },
      {
        label: 'Optional — OpenEMR FHIR access for a separate SMART client',
        language: 'text',
        code: `The VedaMD module does not use SMART on FHIR; it reads the chart
directly. Register an API client under Admin → System → API Clients
only if you are building your own SMART app against OpenEMR's FHIR
endpoint (/apis/default/fhir).`,
      },
      {
        label: 'What the module sends (verified OpenEMR schema)',
        language: 'json',
        code: `{
  "hook": "patient-view",
  "hookInstance": "01HVZ...",
  "context": {
    "ageYears": 58, "sex": "female",
    "medications": ["Warfarin 5mg", {"code": "5640", "system": "rxnorm", "name": "Ibuprofen"}],
    "diagnoses": ["atrial fibrillation", "ICD10:I48.0"],
    "allergies": ["Penicillin"],
    "systolicMmHg": 168, "weightKg": 71.2, "bodyTempC": 37.1
  }
}`,
      },
    ],
    links: [
      { label: 'OpenEMR documentation', url: 'https://www.open-emr.org/wiki/', kind: 'docs' },
      {
        label: 'OpenEMR FHIR API guide',
        url: 'https://github.com/openemr/openemr/blob/master/API_README.md',
        kind: 'docs',
      },
      { label: 'OpenEMR GitHub', url: 'https://github.com/openemr/openemr', kind: 'github' },
      {
        label: 'VedaMD OpenEMR module',
        url: 'https://github.com/vedamd/plugins/tree/main/openemr/oe-module-vedamd-cds',
        kind: 'plugin',
      },
    ],
    notes: [
      'OpenEMR has NO CDS Hooks client. Its CDR engine (library/clinical_rules.php, src/ClinicalDecisionRules/) evaluates local database rules only — there is no Globals → Connectors screen for registering a remote CDS service.',
      'OpenEMR stores vitals in US customary units (pounds, inches, Fahrenheit) regardless of the units_of_measurement display setting; the module converts to metric before sending. Do not remove those conversions.',
      'OpenEMR ≥ 7.0 is required for the module event system and Twig card rendering.',
      'If VedaMD is unreachable the module renders nothing and the chart loads normally — decision support never blocks the record.',
    ],
  },
  {
    slug: 'bahmni',
    name: 'Bahmni',
    category: 'open-source',
    tagline:
      'Distribution combining OpenMRS (clinical) + ERPNext (admin/billing) + OpenELIS (lab) + OpenImaging — widely deployed across SSA + India.',
    description:
      'Bahmni stitches OpenMRS, ERPNext and OpenELIS into a single deployment. Bahmni authors the CDSS module (openmrs-module-cdss) that VedaMD integrates through, so the setup is identical to OpenMRS: install the module, set the cdss.fhir.baseurl global property to a VedaMD CDS bridge, and grant the Execute CDSS privilege.',
    homepage: 'https://www.bahmni.org',
    primaryMethod: 'cds-hooks',
    methods: ['cds-hooks', 'fhir-rest', 'rest', 'webhook'],
    tags: ['ssa', 'india', 'hospital'],
    snippets: [
      {
        label: 'Check whether the CDSS module is already installed',
        language: 'bash',
        code: `# Administration → Manage Modules → look for "CDSS"
# Recent Bahmni distributions bundle it; otherwise build from source:
git clone https://github.com/Bahmni/openmrs-module-cdss.git
cd openmrs-module-cdss && mvn clean install
cp omod/target/cdss-*.omod /opt/openmrs/modules/`,
      },
      {
        label: 'Point the module at a VedaMD CDS bridge',
        language: 'bash',
        code: `# The module sends no Authorization header, so the bridge holds the key.
docker run -d --name vedamd-bridge --restart unless-stopped \\
  -e VEDAMD_API_KEY=vmd_live_xxxxxxxx \\
  -e VEDAMD_BASE_URL=${VEDAMD_BASE_URL_PLACEHOLDER} \\
  -p 127.0.0.1:8088:8088 vedamd/cds-bridge:0.1.0

# Global property (discovery URL — the module appends /{serviceId}):
#   cdss.fhir.baseurl = http://vedamd-bridge:8088/cds-services`,
      },
      {
        label: 'Restart the Bahmni stack after the config change',
        language: 'bash',
        code: `cd bahmni_docker
docker compose restart openmrs proxy`,
      },
    ],
    links: [
      {
        label: 'Bahmni documentation',
        url: 'https://bahmni.atlassian.net/wiki/spaces/BAH/overview',
        kind: 'docs',
      },
      { label: 'Bahmni GitHub', url: 'https://github.com/Bahmni', kind: 'github' },
      {
        label: 'Bahmni CDSS module',
        url: 'https://github.com/Bahmni/openmrs-module-cdss',
        kind: 'plugin',
      },
      { label: 'Bahmni Docker', url: 'https://github.com/Bahmni/bahmni-docker', kind: 'github' },
    ],
    notes: [
      'There is no cds_hooks_services.json in a Bahmni deployment — configuration is the single OpenMRS global property cdss.fhir.baseurl.',
      'Bahmni calls POST /openmrs/ws/rest/v1/cdss?service={serviceId}; set that service id to a VedaMD service (e.g. vedamd-order-select) in the Bahmni app config.',
      'Bahmni 0.93+ supports OpenMRS FHIR2, which the CDSS module uses to build the prefetch bundle.',
      'For lab-derived rules (creatinine → renal dosing) consume OpenELIS results through the OpenMRS observation pipeline — without a creatinine those rules stay silent.',
    ],
  },
  {
    slug: 'erpnext-frappe-healthcare',
    name: 'ERPNext / Frappe Healthcare',
    category: 'open-source',
    tagline:
      'Frappe Healthcare ships ERPNext clinical workflows + REST + webhook hooks — popular in India and emerging in SSA.',
    description:
      'Frappe Healthcare layers patient, encounter, lab, vaccination and clinical-procedure DocTypes on top of ERPNext. Server Scripts and Webhooks can call VedaMD CDS Hooks endpoints when an encounter or prescription is saved.',
    homepage: 'https://frappe.io/health',
    primaryMethod: 'webhook',
    methods: ['webhook', 'rest', 'cds-hooks'],
    tags: ['ambulatory', 'hospital', 'india', 'ssa'],
    snippets: [
      {
        label: 'Install the VedaMD Frappe app (recommended)',
        language: 'bash',
        code: `cd ~/frappe-bench
bench get-app https://github.com/vedamd/vedamd_cds.git
bench --site your-site.local install-app vedamd_cds

# Key goes in site_config.json, so it stays out of database backups:
bench --site your-site.local set-config vedamd_api_key "vmd_live_xxxxxxxx"
bench --site your-site.local set-config vedamd_base_url "${VEDAMD_BASE_URL_PLACEHOLDER}"`,
      },
      {
        label: 'Or a Server Script — note: `import requests` is BLOCKED',
        language: 'python',
        code: `# Server Script → DocType Event → Patient Encounter → Before Save
#
# Server Scripts run under RestrictedPython. \`import requests\` fails;
# frappe.integrations.utils.make_post_request is whitelisted. Code runs
# inline with \`doc\` in scope — defining a function nobody calls is a
# common way to make a script that silently never fires.

meds = [d.drug_name for d in (doc.drug_prescription or []) if d.drug_name]

if meds:
    response = make_post_request(
        "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-order-select",
        headers={"Authorization": "Bearer vmd_live_xxxxxxxx",
                 "Content-Type": "application/json"},
        json={"hook": "order-select",
              "hookInstance": frappe.generate_hash(length=20),
              "context": {"medications": meds,
                          "ageYears": frappe.utils.cint((doc.patient_age or "0").split()[0])}},
        timeout=4,
    )
    for card in (response or {}).get("cards", []):
        frappe.msgprint(card.get("summary"), title="VedaMD",
                        indicator="red" if card.get("indicator") == "critical" else "blue")`,
      },
      {
        label: 'Webhook (fire-and-forget — no cards reach the clinician)',
        language: 'json',
        code: `{
  "webhook_doctype": "Patient Encounter",
  "webhook_docevent": "on_submit",
  "request_url": "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-order-select",
  "webhook_headers": [{ "key": "Authorization", "value": "Bearer vmd_live_..." }]
}`,
      },
    ],
    links: [
      { label: 'Frappe Healthcare docs', url: 'https://docs.frappe.io/healthcare', kind: 'docs' },
      {
        label: 'ERPNext Server Scripts',
        url: 'https://docs.erpnext.com/docs/user/manual/en/server-script',
        kind: 'docs',
      },
      {
        label: 'Frappe Healthcare GitHub',
        url: 'https://github.com/frappe/health',
        kind: 'github',
      },
      {
        label: 'VedaMD Frappe app',
        url: 'https://github.com/vedamd/plugins/tree/main/frappe/vedamd_cds',
        kind: 'plugin',
      },
    ],
    notes: [
      'Server Scripts run under RestrictedPython: `import requests` is blocked. Use frappe.integrations.utils.make_post_request, which is whitelisted.',
      'A Webhook cannot deliver decision support — it is fire-and-forget, so the response never returns to the form and the clinician sees nothing. Use it for audit only.',
      'The VedaMD app reads verified Frappe Health fields: Patient Encounter (patient_age, patient_sex, drug_prescription, codification_table) and Patient (dob, sex, allergies, medication).',
      'Saving is never blocked — cards are msgprint notices, not validation errors.',
    ],
  },
  {
    slug: 'gnu-health',
    name: 'GNU Health',
    category: 'open-source',
    tagline:
      'GNU Project hospital information system — strong in LATAM, growing in SSA — exposes XML-RPC + REST + FHIR.',
    description:
      'GNU Health is a hospital + lab + public health information system built on the Tryton ERP. VedaMD ships a Tryton module that hooks the prescription workflow and calls VedaMD directly through the ORM. GNU Health\u2019s FHIR interface is a separate, read-only Flask server maintained outside core and is not used.',
    homepage: 'https://www.gnuhealth.org',
    primaryMethod: 'rest',
    methods: ['rest', 'webhook'],
    tags: ['latam', 'public-health', 'ssa'],
    snippets: [
      {
        label: 'Install the VedaMD Tryton module',
        language: 'bash',
        code: `git clone https://github.com/vedamd/plugins.git
cp -r plugins/gnu-health/trytond_vedamd_cds /path/to/trytond/modules/vedamd_cds

trytond-admin -d <database> -u vedamd_cds --activate-dependencies
systemctl restart trytond`,
      },
      {
        label: 'Configure',
        language: 'text',
        code: `Health → Configuration → VedaMD Configuration
  (restricted to health administrators)

  Enabled          yes
  VedaMD base URL  ${VEDAMD_BASE_URL_PLACEHOLDER}
  API key          vmd_live_xxxxxxxx
  CDS service id   vedamd-order-select
  Timeout          4 seconds`,
      },
    ],
    links: [
      { label: 'GNU Health documentation', url: 'https://docs.gnuhealth.org', kind: 'docs' },
      {
        label: 'GNU Health Savannah',
        url: 'https://savannah.gnu.org/projects/health/',
        kind: 'github',
      },
    ],
    notes: [
      'GNU Health\u2019s FHIR server (gnuhealth-fhir-server) is a separate, read-only Flask application maintained outside GNU Health core and has not tracked recent FHIR releases — the Tryton module reads the ORM instead.',
      'Prescribing is never blocked: a failed or slow VedaMD call logs its failure class and returns no cards.',
      'Verify patient.weight and patient.diseases against your GNU Health version — those fields have moved between releases.',
    ],
  },
  {
    slug: 'dhis2',
    name: 'DHIS2',
    category: 'open-source',
    tagline:
      'District Health Information System — backbone of national HMIS in Kenya (KHIS), Uganda, Tanzania, Rwanda and 80+ countries.',
    description:
      'DHIS2 is the largest health information system in the world, used as national HMIS by 80+ countries including Kenya (KHIS), Tanzania (HMIS), Uganda (HMIS2). DHIS2 program rules cannot call an external service — no action type performs an HTTP request — so real-time decision support runs as a DHIS2 app alongside the Tracker form, reading the enrolment through the Tracker API.',
    homepage: 'https://dhis2.org',
    primaryMethod: 'rest',
    methods: ['rest', 'webhook', 'iframe-embed'],
    tags: ['national-hmis', 'ssa', 'kenya', 'public-health'],
    snippets: [
      {
        label: 'Install the VedaMD DHIS2 Tracker app',
        language: 'bash',
        code: `git clone https://github.com/vedamd/plugins.git
cd plugins/dhis2/vedamd-dhis2-app
yarn install && yarn build

# Upload build/bundle/*.zip via App Management → Install app.
# The app is configured with a BRIDGE url, not an API key: a DHIS2 app
# runs in the browser, where no secret can be kept.`,
      },
      {
        label: 'Map your data elements to VedaMD context fields',
        language: 'javascript',
        code: `// src/mapping.js — every DHIS2 deployment names its own metadata,
// so the mapping is configuration. Unmapped uids are never sent.
export const defaultMapping = [
  { uid: 'YOUR_SEX_UID', field: 'sex', coerce: 'text',
    values: { Male: 'male', Female: 'female' } },
  { uid: 'YOUR_AGE_UID', field: 'ageYears', coerce: 'number', min: 0, max: 130 },
  { uid: 'YOUR_SBP_UID', field: 'systolicMmHg', coerce: 'number', min: 40, max: 300 },
];`,
      },
      {
        label: 'Webhook program notification (audit only — not decision support)',
        language: 'text',
        code: `Programs → Program notifications → recipient type "Web hook"

Fire-and-forget: the response never returns to the Tracker form, so a
clinician sees nothing. Use it to record that a check was requested —
never as the mechanism for showing a safety alert.`,
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
      {
        label: 'DHIS2 Web API',
        url: 'https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/introduction.html',
        kind: 'docs',
      },
      { label: 'Kenya KHIS', url: 'https://hiskenya.org', kind: 'docs' },
      {
        label: 'VedaMD DHIS2 app',
        url: 'https://github.com/vedamd/plugins/tree/main/dhis2/vedamd-dhis2-app',
        kind: 'plugin',
      },
    ],
    notes: [
      'DHIS2 program rules have no HTTP action. The available action types are assign value, display text, display key/value pair, error on complete, hide field, hide section, prevent adding events, make field mandatory, show error, show warning, warning on complete, send message, schedule message — none reaches the network.',
      'There is no WS.post() and no "send message to URL" action; any snippet claiming otherwise will not run.',
      'Kenya KHIS / KePMs is a DHIS2 deployment — county-level integration follows the same pattern, but the metadata uids differ and the mapping must be re-pointed.',
      'For aggregate analytics, push pre-computed indicators to DHIS2 data sets; for individual decisions, use Tracker.',
    ],
  },
  {
    slug: 'openhim',
    name: 'OpenHIM',
    category: 'open-source',
    tagline:
      'Open Health Information Mediator — the OpenHIE backbone routing between facility EMRs and national registries.',
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
      {
        label: 'OpenHIM documentation',
        url: 'https://openhim.org/docs/introduction/about',
        kind: 'docs',
      },
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
    tagline:
      "Dimagi's open-source mobile platform for community health workers — widely used in SSA and South Asia.",
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
  "trigger_url": "${VEDAMD_BASE_URL_PLACEHOLDER}/cds-services/vedamd-patient-view",
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
      {
        label: 'CommCare Data Forwarding',
        url: 'https://confluence.dimagi.com/display/commcarepublic/Data+Forwarding',
        kind: 'docs',
      },
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
    tagline:
      'Largest enterprise EMR — SMART on FHIR + CDS Hooks supported via App Orchard / Showroom.',
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
Authentication: Bearer API key — Authorization: Bearer vmd_live_...

VedaMD does NOT currently expose an OAuth2 client-credentials token
endpoint. If your Epic configuration requires OAuth2 for outbound CDS
Hooks calls, raise it with VedaMD before scheduling the integration.`,
      },
      {
        label: 'Prefetch templates to request from Epic',
        language: 'json',
        code: `{
  "patient": "Patient/{{context.patientId}}",
  "conditions": "Condition?patient={{context.patientId}}&clinical-status=active",
  "medications": "MedicationRequest?patient={{context.patientId}}&status=active",
  "allergies": "AllergyIntolerance?patient={{context.patientId}}",
  "labs": "Observation?patient={{context.patientId}}&category=laboratory&_count=50&_sort=-date"
}`,
      },
    ],
    links: [
      { label: 'Epic App Orchard / Showroom', url: 'https://apporchard.epic.com', kind: 'docs' },
      { label: 'Epic on FHIR', url: 'https://fhir.epic.com', kind: 'sandbox' },
    ],
    notes: [
      'The gating step is vendor onboarding, not engineering — Showroom listing and health-system enablement cannot be shortcut with code.',
      'VedaMD accepts Epic’s CDS Hooks payload unmodified: FHIR resources in context.draftOrders and in prefetch are read directly.',
      'The `labs` prefetch template matters most — without a creatinine the renal and hepatic dosing rules stay silent, which reads as a broken integration when it is merely an uninformed one.',
      'Sandbox testing at https://fhir.epic.com requires Epic developer registration.',
    ],
  },
  {
    slug: 'cerner-oracle-health',
    name: 'Cerner / Oracle Health',
    category: 'proprietary',
    tagline:
      'Cerner Millennium (now Oracle Health) — CDS Hooks + SMART on FHIR via code (formerly Cerner Open Developer Experience).',
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
4. Authentication: Bearer API key (Authorization: Bearer vmd_live_...)

   VedaMD has no OAuth2 token endpoint — raise this with VedaMD if your
   configuration requires client-credentials.`,
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
    tagline:
      'Allscripts (now Veradigm) supports FHIR R4 + the Allscripts Developer Program for CDS Hooks.',
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
      {
        label: 'Allscripts Developer Program',
        url: 'https://developer.veradigm.com',
        kind: 'docs',
      },
    ],
  },
  {
    slug: 'athenahealth',
    name: 'Athenahealth',
    category: 'proprietary',
    tagline:
      'Athenahealth — FHIR R4 + CDS Hooks via the More Disruption Please (MDP) developer programme.',
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
      {
        label: 'athenahealth Developer Portal',
        url: 'https://developerportal.athenahealth.com',
        kind: 'docs',
      },
    ],
  },

  // ---------- Pure-standard integrations ----------
  {
    slug: 'hl7v2',
    name: 'HL7 v2',
    category: 'standard',
    tagline:
      'Legacy but ubiquitous — ADT, ORU, ORM, MDM, SIU messages still drive most hospital interfaces.',
    description:
      'HL7 v2 remains the workhorse interface standard. VedaMD does not natively parse HL7 v2 — it speaks FHIR and CDS Hooks — but the OpenHIM mediator (or Mirth Connect / Iguana / Rhapsody) can transform incoming HL7 v2 messages to FHIR resources and call VedaMD.',
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
      {
        label: 'HL7 v2 specifications',
        url: 'https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185',
        kind: 'docs',
      },
      {
        label: 'Mirth Connect (NextGen Connect)',
        url: 'https://www.nextgen.com/products-and-services/integration-engine',
        kind: 'docs',
      },
      {
        label: 'HAPI HL7 v2 (Java)',
        url: 'https://hapifhir.github.io/hapi-hl7v2/',
        kind: 'github',
      },
    ],
    notes: [
      'For Kenya KePMs / facility deployments still on HL7 v2, place Mirth Connect or OpenHIM between the legacy EMR and VedaMD.',
    ],
  },
  {
    slug: 'fhir-r4',
    name: 'FHIR R4',
    category: 'standard',
    tagline:
      'Native — VedaMD speaks FHIR R4 directly for Patient, MedicationRequest, Condition, Observation, AllergyIntolerance.',
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
    supportedHooks: [
      'patient-view',
      'medication-prescribe',
      'order-select',
      'order-sign',
      'encounter-discharge',
      'appointment-book',
    ],
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
      {
        label: 'CDS Hooks 1.0 specification',
        url: 'https://cds-hooks.org/specification/1.0/',
        kind: 'docs',
      },
      { label: 'CDS Hooks sandbox', url: 'https://sandbox.cds-hooks.org', kind: 'sandbox' },
    ],
  },
  {
    slug: 'smart-on-fhir',
    name: 'SMART on FHIR',
    category: 'standard',
    tagline:
      'The OAuth2 + FHIR context standard for embedded EMR apps. Not yet implemented by VedaMD.',
    description:
      'SMART on FHIR provides the OAuth2 + FHIR context standard for embedded apps. VedaMD does NOT currently ship a SMART app — there is no launch or callback endpoint to register. Integrations today use CDS Hooks (VedaMD returns cards into the EMR workflow) or a platform plugin. This entry documents the planned shape; the snippet below is the pattern a SMART app would follow, not a URL that resolves today.',
    homepage: 'https://hl7.org/fhir/smart-app-launch/',
    primaryMethod: 'smart-on-fhir',
    methods: ['smart-on-fhir'],
    tags: ['standard', 'embed', 'oauth2'],
    snippets: [
      {
        label: 'SMART app launch URL pattern (PLANNED — not live)',
        language: 'text',
        code: `These endpoints are not yet deployed. Use CDS Hooks today.

Launch:    https://app.vedamd.io/smart/launch?iss={fhir-server-url}&launch={launch-token}
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
      {
        label: 'fhirclient (JS)',
        url: 'https://github.com/smart-on-fhir/client-js',
        kind: 'github',
      },
      {
        label: 'SMART Health IT sandbox',
        url: 'https://launch.smarthealthit.org',
        kind: 'sandbox',
      },
    ],
  },
];
