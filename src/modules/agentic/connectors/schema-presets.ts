import type { NamedQuery } from './sql-connector.types';

/**
 * Schema-mapper presets for common EHR / HMIS platforms used across
 * sub-Saharan Africa + globally. Each preset is a STARTING TEMPLATE —
 * a parameterised read-only query + a declarative column→context
 * mapping. Operators clone a preset, adjust table/column names to
 * their local schema + version, and register it via
 * AGENTIC_SQL_QUERIES (or the registerQuery API).
 *
 * Why templates, not turnkey: every EHR deployment customises its
 * schema (concept dictionaries, custom forms, table prefixes), so a
 * single hard-coded query can't be universal. These presets encode
 * the canonical shape of each platform's medication / problem /
 * allergy / observation tables so integrators start 90 % of the way
 * there instead of from scratch.
 *
 * SECURITY: all presets are SELECT-only + parameterised. They never
 * select identifiers (name, MRN, address) — only the clinical
 * signals VedaMD reasons over.
 */

export interface SchemaPreset {
  /** Preset id (e.g. "openmrs.active-meds"). */
  id: string;
  /** Platform family. */
  platform: 'openmrs' | 'bahmni' | 'openemr' | 'dhis2-tracker' | 'fhir-sql' | 'generic';
  /** Human description. */
  description: string;
  /** Dialect the template SQL targets. */
  dialect: 'postgres' | 'mysql' | 'mssql' | 'oracle';
  /** The named query (clone + register to use). */
  query: NamedQuery;
}

/**
 * OpenMRS (MySQL) — the dominant FOSS EMR in SSA. Medications live in
 * `drug_order`/`orders`/`drug`; problems in `obs` joined to the
 * problem-list concept; allergies in `allergy`/`allergy_reaction`.
 * Template assumes a single :encounterId bind.
 */
const OPENMRS: SchemaPreset[] = [
  {
    id: 'openmrs.active-meds',
    platform: 'openmrs',
    description: 'OpenMRS active drug orders for an encounter (MySQL).',
    dialect: 'mysql',
    query: {
      id: 'openmrs.active-meds',
      sql: `SELECT d.name AS med
            FROM drug_order do2
            JOIN orders o ON o.order_id = do2.order_id
            JOIN drug d ON d.drug_id = do2.drug_inventory_id
            WHERE o.encounter_id = :encounterId
              AND o.voided = 0
              AND (o.date_stopped IS NULL OR o.date_stopped > NOW())`,
      mapping: { medicationColumn: 'med' },
    },
  },
  {
    id: 'openmrs.problem-list',
    platform: 'openmrs',
    description: 'OpenMRS active problem list for a patient (MySQL).',
    dialect: 'mysql',
    query: {
      id: 'openmrs.problem-list',
      sql: `SELECT cn.name AS dx
            FROM obs
            JOIN concept_name cn ON cn.concept_id = obs.value_coded
            WHERE obs.person_id = :patientId
              AND obs.concept_id = :problemConceptId
              AND obs.voided = 0
              AND cn.locale = 'en' AND cn.concept_name_type = 'FULLY_SPECIFIED'`,
      mapping: { diagnosisColumn: 'dx' },
    },
  },
  {
    id: 'openmrs.allergies',
    platform: 'openmrs',
    description: 'OpenMRS allergies for a patient (MySQL).',
    dialect: 'mysql',
    query: {
      id: 'openmrs.allergies',
      sql: `SELECT cn.name AS allergy
            FROM allergy a
            JOIN concept_name cn ON cn.concept_id = a.coded_allergen
            WHERE a.patient_id = :patientId
              AND a.voided = 0
              AND cn.locale = 'en' AND cn.concept_name_type = 'FULLY_SPECIFIED'`,
      mapping: { allergyColumn: 'allergy' },
    },
  },
];

/**
 * Bahmni (OpenMRS + OpenERP/Odoo) — sits on the OpenMRS schema, so the
 * OpenMRS templates apply; this adds a vitals/labs observation pull.
 */
const BAHMNI: SchemaPreset[] = [
  {
    id: 'bahmni.recent-labs',
    platform: 'bahmni',
    description: 'Bahmni/OpenMRS numeric observations (labs/vitals) for a patient (MySQL).',
    dialect: 'mysql',
    query: {
      id: 'bahmni.recent-labs',
      sql: `SELECT cn.name AS lab_name, obs.value_numeric AS lab_value, cu.units AS lab_unit
            FROM obs
            JOIN concept_name cn ON cn.concept_id = obs.concept_id
            LEFT JOIN concept_numeric cu ON cu.concept_id = obs.concept_id
            WHERE obs.person_id = :patientId
              AND obs.value_numeric IS NOT NULL
              AND obs.voided = 0
              AND obs.obs_datetime > (NOW() - INTERVAL 180 DAY)
              AND cn.locale = 'en' AND cn.concept_name_type = 'FULLY_SPECIFIED'`,
      mapping: {
        lab: { nameColumn: 'lab_name', valueColumn: 'lab_value', unitColumn: 'lab_unit' },
      },
    },
  },
];

/**
 * openEMR (MySQL) — widely deployed globally. Meds in `prescriptions`,
 * problems in `lists` (type='medical_problem'), allergies in `lists`
 * (type='allergy').
 */
const OPENEMR: SchemaPreset[] = [
  {
    id: 'openemr.active-meds',
    platform: 'openemr',
    description: 'openEMR active prescriptions for a patient (MySQL).',
    dialect: 'mysql',
    query: {
      id: 'openemr.active-meds',
      sql: `SELECT drug AS med
            FROM prescriptions
            WHERE patient_id = :patientId
              AND active = 1`,
      mapping: { medicationColumn: 'med' },
    },
  },
  {
    id: 'openemr.problems',
    platform: 'openemr',
    description: 'openEMR active medical problems for a patient (MySQL).',
    dialect: 'mysql',
    query: {
      id: 'openemr.problems',
      sql: `SELECT title AS dx
            FROM lists
            WHERE pid = :patientId
              AND type = 'medical_problem'
              AND (enddate IS NULL OR enddate = '0000-00-00')`,
      mapping: { diagnosisColumn: 'dx' },
    },
  },
  {
    id: 'openemr.allergies',
    platform: 'openemr',
    description: 'openEMR active allergies for a patient (MySQL).',
    dialect: 'mysql',
    query: {
      id: 'openemr.allergies',
      sql: `SELECT title AS allergy
            FROM lists
            WHERE pid = :patientId
              AND type = 'allergy'
              AND (enddate IS NULL OR enddate = '0000-00-00')`,
      mapping: { allergyColumn: 'allergy' },
    },
  },
];

/**
 * DHIS2 Tracker (Postgres) — used for HMIS + disease programmes across
 * SSA. Data is EAV: trackedentitydatavalue / programstageinstance.
 * The template pulls data-element values for an enrollment; the
 * operator maps their specific data-element UIDs to clinical fields.
 */
const DHIS2: SchemaPreset[] = [
  {
    id: 'dhis2.tracker-values',
    platform: 'dhis2-tracker',
    description:
      'DHIS2 Tracker data-element values for an event (Postgres). Map your dataElement UIDs to med/dx/lab columns.',
    dialect: 'postgres',
    query: {
      id: 'dhis2.tracker-values',
      sql: `SELECT de.name AS element_name, tedv.value AS element_value
            FROM trackedentitydatavalue tedv
            JOIN dataelement de ON de.dataelementid = tedv.dataelementid
            JOIN programstageinstance psi ON psi.programstageinstanceid = tedv.programstageinstanceid
            WHERE psi.uid = :eventUid
              AND tedv.deleted = false`,
      // EAV — operator typically post-processes; medicationColumn left
      // for the common case where one data element holds the drug name.
      mapping: { medicationColumn: 'element_value' },
    },
  },
];

/**
 * Generic FHIR-on-SQL (Postgres) — for warehouses that flatten FHIR
 * into relational tables (e.g. Google Cloud Healthcare BigQuery export,
 * Squire, Pathling). Assumes lower-cased FHIR resource tables.
 */
const FHIR_SQL: SchemaPreset[] = [
  {
    id: 'fhir-sql.active-meds',
    platform: 'fhir-sql',
    description: 'Flattened FHIR MedicationRequest table — active meds for a patient (Postgres).',
    dialect: 'postgres',
    query: {
      id: 'fhir-sql.active-meds',
      sql: `SELECT medication_display AS med
            FROM medicationrequest
            WHERE subject_patient_id = :patientId
              AND status = 'active'`,
      mapping: { medicationColumn: 'med' },
    },
  },
  {
    id: 'fhir-sql.conditions',
    platform: 'fhir-sql',
    description: 'Flattened FHIR Condition table — active conditions for a patient (Postgres).',
    dialect: 'postgres',
    query: {
      id: 'fhir-sql.conditions',
      sql: `SELECT code_display AS dx
            FROM condition
            WHERE subject_patient_id = :patientId
              AND clinical_status = 'active'`,
      mapping: { diagnosisColumn: 'dx' },
    },
  },
];

export const SCHEMA_PRESETS: SchemaPreset[] = [
  ...OPENMRS,
  ...BAHMNI,
  ...OPENEMR,
  ...DHIS2,
  ...FHIR_SQL,
];

export function listPresets(platform?: SchemaPreset['platform']): SchemaPreset[] {
  return platform ? SCHEMA_PRESETS.filter((p) => p.platform === platform) : SCHEMA_PRESETS;
}

export function getPreset(id: string): SchemaPreset | undefined {
  return SCHEMA_PRESETS.find((p) => p.id === id);
}
