import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CdsCard,
  CdsHookRequest,
  CdsHookResponse,
  CdsServiceDescriptor,
  StatelessCapability,
} from './cds.types';
import { CdsStrategyRegistry } from './strategies/registry';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import type { AppConfig } from '../../config/configuration';

/**
 * Stateless evaluation service. Patient context arrives in the request,
 * is evaluated in memory, and is released when the response is sent.
 * No part of the inbound bundle is logged, cached, queued, or persisted
 * (FR-088, NFR-028).
 *
 * Rule logic is split into two halves:
 *   - DECLARATION lives in content/bundles/v.../cds-rules.json (signed,
 *     governed, versioned). Loaded via KnowledgeService.
 *   - IMPLEMENTATION lives as a CdsRuleStrategy class per rule type,
 *     wired into the CdsStrategyRegistry. The registry resolves
 *     strategies by `type`.
 */
@Injectable()
export class CdsService {
  private readonly services: CdsServiceDescriptor[] = [
    {
      id: 'vedamd-medication-prescribe',
      hook: 'medication-prescribe',
      title: 'VedaMD prescribing safety',
      description:
        'Drug-drug interactions, dose checking, pediatric/renal/hepatic adjustments, AWaRe stewardship.',
    },
    {
      id: 'vedamd-patient-view',
      hook: 'patient-view',
      title: 'VedaMD patient overview alerts',
      description:
        'Surface overdue screening, abnormal labs, and chronic-disease gaps on chart open.',
    },
    {
      id: 'vedamd-imci-fever-under5',
      hook: 'patient-view',
      title: 'IMCI: fever assessment in children under 5',
      description:
        'WHO IMCI 2014 — flags any febrile illness (temperature ≥37.5°C in the last 14 days) in a child under five, and escalates to critical when an IMCI general danger sign is reported.',
    },
    {
      id: 'vedamd-pen-hypertension-screen',
      hook: 'patient-view',
      title: 'WHO PEN: hypertension screening',
      description:
        'WHO PEN HEARTS — flags a likely new hypertension diagnosis in any adult (≥18) with ≥2 BP readings of ≥140/≥90 in the last 90 days who is not already known to be hypertensive. Recommends confirmatory measurement and lifestyle counselling before pharmacotherapy.',
    },
    {
      id: 'vedamd-pen-diabetes-screen',
      hook: 'patient-view',
      title: 'WHO PEN: diabetes screening',
      description:
        'WHO PEN 2020 — flags a likely new diabetes diagnosis in any adult (≥18) with a fasting plasma glucose ≥7.0 mmol/L, a random glucose ≥11.1 mmol/L, or HbA1c ≥6.5% in the last 180 days, who is not already known to be diabetic. Recommends confirmatory test on a separate day.',
    },
    {
      id: 'vedamd-paediatric-dosing',
      hook: 'medication-prescribe',
      title: 'Paediatric dosing safety',
      description:
        'On medication-prescribe with a child weight (<50 kg) in context, returns a calculated paediatric dose per proposed drug, plus warnings (min-weight floor, renal contraindications, missing protocol). Critical card when the calculator refuses to compute a dose.',
    },
    {
      id: 'vedamd-anc-first-contact',
      hook: 'patient-view',
      title: 'WHO ANC SMART — first antenatal contact',
      description:
        'WHO ANC SMART Guideline (2016) — at the first ANC contact, screens for obstetric danger signs (urgent referral when present), flags late booking (>12 weeks), and surfaces the first-visit checklist (BP, urine dip, Hb, blood group/Rh, HIV/syphilis/HepB screening, tetanus, folic acid + iron, ITN where endemic).',
    },
    {
      id: 'vedamd-imci-diarrhoea-under5',
      hook: 'patient-view',
      title: 'IMCI: diarrhoea + dehydration in children under 5',
      description:
        'WHO IMCI 2014 — classifies dehydration (no / some / severe) and emits Plan A, B, or C; overlays warnings for persistent diarrhoea (>=14 days) and dysentery (blood in stool).',
    },
    {
      id: 'vedamd-imci-pneumonia-under5',
      hook: 'patient-view',
      title: 'IMCI: cough or difficult breathing in children under 5',
      description:
        'WHO IMCI 2014 — classifies severe pneumonia / pneumonia / no pneumonia from age-banded respiratory-rate threshold, chest indrawing, stridor, danger signs and pulse-oximetry.',
    },
    {
      id: 'vedamd-pen-cvd-risk',
      hook: 'patient-view',
      title: 'WHO PEN — total cardiovascular risk',
      description:
        'WHO PEN HEARTS — approximate WHO/ISH 10-year CVD risk band (low / moderate / high / very high) from age, sex, SBP, smoking, diabetes, optional cholesterol. Bands map to PEN-aligned management.',
    },
    {
      id: 'vedamd-anc-preeclampsia-screen',
      hook: 'patient-view',
      title: 'WHO ANC SMART — pre-eclampsia screen',
      description:
        'WHO ANC SMART Guideline + Kenya MoH ANC profile — from 20 weeks gestation, flags severe pre-eclampsia (urgent magnesium sulphate + referral), pre-eclampsia (close monitoring), or gestational hypertension based on BP series, urine proteinuria and severe symptoms.',
    },
    {
      id: 'vedamd-tb-symptom-screen',
      hook: 'patient-view',
      title: 'WHO/Kenya NTP TB symptom screen',
      description:
        'WHO 2021 systematic-screening + Kenya NTP — fires the TB symptom screen for cough >=14 days, two-or-more risk markers in the general population, or any one symptom in people living with HIV (four-symptom rule). Recommends Xpert MTB/RIF Ultra; offers HIV testing where status is unknown.',
    },
    {
      id: 'vedamd-imci-malaria-under5',
      hook: 'patient-view',
      title: 'IMCI: malaria in children under 5',
      description:
        'WHO IMCI + Kenya National Malaria Treatment Guidelines — classifies severe malaria (any IMCI danger sign, severe anaemia, impaired consciousness, prostration, convulsions, respiratory distress) with pre-referral parenteral artesunate, uncomplicated malaria (RDT-positive, no severe signs) with AL, or RDT-negative.',
    },
    {
      id: 'vedamd-imci-malnutrition-under5',
      hook: 'patient-view',
      title: 'IMCI: acute malnutrition (SAM / MAM) in children under 5',
      description:
        'WHO IMCI + Kenya MoH IMAM — classifies complicated SAM (admit for F-75/F-100 stabilisation), uncomplicated SAM (OTP with RUTF), MAM (SFP), or no acute malnutrition. Reads MUAC mm, bilateral pitting oedema, weight-for-height Z-score, appetite test and complication flags.',
    },
    {
      id: 'vedamd-adult-cap-crb65',
      hook: 'patient-view',
      title: 'Adult community-acquired pneumonia — CRB-65 severity',
      description:
        'CRB-65 score (Confusion, Respiratory rate >=30, BP <90/<=60, age >=65) tiers an adult with suspected pneumonia into low / moderate / high risk. SpO2 < 92% upgrades to at least moderate even with CRB-65 score 0. Recommends outpatient amoxicillin vs admission with IV antibiotics.',
    },
    {
      id: 'vedamd-anc-pph-risk-screen',
      hook: 'patient-view',
      title: 'ANC: postpartum-haemorrhage (PPH) risk screen',
      description:
        'WHO 2022 PPH recommendations + Kenya MoH ANC profile — weighted risk score (previous PPH, antepartum haemorrhage, placenta praevia/accreta, severe anaemia, grand multiparity, multiple pregnancy, polyhydramnios, macrosomia, prolonged labour, bleeding diathesis, pre-eclampsia). Score >=3 routes to CEmONC facility with cross-matched blood.',
    },
    {
      id: 'vedamd-phq9-depression-screen',
      hook: 'patient-view',
      title: 'PHQ-9 depression screen with suicide-risk gate',
      description:
        'WHO mhGAP Intervention Guide + Kenya MoH mental-health protocol — scores the nine PHQ-9 items, bands severity (minimal / mild / moderate / mod-severe / severe), and emits an additional critical card whenever item 9 (thoughts of being better off dead or self-harm) >= 1, surfacing the same-day suicide-risk pathway.',
    },
    {
      id: 'vedamd-gad7-anxiety-screen',
      hook: 'patient-view',
      title: 'GAD-7 generalised anxiety disorder screen',
      description:
        'WHO mhGAP-aligned GAD-7 — scores the seven anxiety items, bands minimal (0-4) / mild (5-9) / moderate (10-14) / severe (15-21), and recommends supportive counselling, structured psychological therapy, or SSRI + specialist referral per band.',
    },
    {
      id: 'vedamd-cage-aid-substance-screen',
      hook: 'patient-view',
      title: 'CAGE-AID alcohol + drug-use screen',
      description:
        'WHO mhGAP substance-use module — four yes/no items (Cut down, Annoyed, Guilty, Eye-opener). >=2 yes is positive: brief intervention + AUDIT/ASSIST follow-up + HIV/HCV/TB screen. Critical escalation when withdrawal signs, recent injection use, or recent overdose are reported.',
    },
    {
      id: 'vedamd-hiv-pitc-trigger',
      hook: 'patient-view',
      title: 'Provider-initiated HIV testing and counselling (PITC) trigger',
      description:
        'WHO HTS 2019 + Kenya NASCOP — fires when hivStatusUnknown is true. Critical tier for standard-of-care offer (pregnancy, TB, new STI, infant of HIV+ mother); warning tier for key populations, serodiscordant contacts, clinical HIV features; info tier for routine universal-offer reminders.',
    },
    {
      id: 'vedamd-adult-acs-recognition',
      hook: 'patient-view',
      title: 'Adult acute coronary syndrome — recognition + emergency bundle',
      description:
        'WHO PEN-HEARTS acute coronary care + Kenya MoH cardiology guidance. CRITICAL for STEMI-pattern / high-risk NSTEACS (ongoing pain >=20 min + typical features, haemodynamic instability, reported ST elevation, ongoing pain with prior MI/PCI, or SpO2 <90%): aspirin 300 + clopidogrel 300 + GTN + morphine + statin loading + activate STEMI pathway. WARNING for mid-risk; INFO for low-risk with ECG documentation.',
    },
    {
      id: 'vedamd-imci-young-infant',
      hook: 'patient-view',
      title: 'IMCI young-infant (0–59 days) — possible serious bacterial infection',
      description:
        'WHO IMCI Young-Infant Chart. CRITICAL pre-referral ampicillin + gentamicin for severe features (not feeding well, convulsions, severe chest indrawing, fast breathing >=60 confirmed, movement only with stimulation, fever >=37.5 or hypothermia <35.5, severe jaundice, bulging fontanelle). WARNING for local bacterial infection (umbilicus / pustules) with topical care + oral amoxicillin. Auto-computed weight-banded antibiotic doses when weightKg supplied.',
    },
    {
      id: 'vedamd-stroke-fast-recognition',
      hook: 'patient-view',
      title: 'Adult stroke — FAST recognition + acute pathway',
      description:
        'WHO PEN-HEARTS stroke pathway. Sentinel-gated by suspectedStroke. Critical card with thrombolysis-window flag (4.5 h IV alteplase) and acute-stroke bundle: airway, glucose (hypoglycaemia stroke-mimic), permissive hypertension (do NOT lower below 220/120 in ischaemic stroke), NBM, urgent non-contrast CT, transfer to a comprehensive stroke facility.',
    },
    {
      id: 'vedamd-sepsis-qsofa',
      hook: 'patient-view',
      title: 'Adult sepsis recognition — qSOFA + 1-hour bundle',
      description:
        'Sepsis-3 + Surviving Sepsis Campaign / WHO 1-hour bundle. Sentinel-gated by suspectedInfection. qSOFA >=2 → critical bundle (lactate, cultures before antibiotics, antibiotic within 1 h, 30 mL/kg crystalloid for hypotension or lactate >=4); qSOFA 1 or organ-dysfunction features → warning; otherwise info. Additional critical card for septic shock (refractory hypotension after fluids OR lactate >4).',
    },
    {
      id: 'vedamd-copd-exacerbation',
      hook: 'patient-view',
      title: 'COPD exacerbation severity',
      description:
        'GOLD 2024 + WHO chronic-respiratory care. Sentinel-gated by knownCopd. Critical for severe exacerbation (confusion/drowsiness, RR >=30, SpO2 <88, accessory-muscle use, SBP <90) — controlled oxygen 88–92%, nebulised salbutamol + ipratropium, oral prednisolone, antibiotic if purulent, NIV if pH <7.35. Warning for moderate (>=2 Anthonisen cardinal symptoms). Info for symptoms below threshold.',
    },
    {
      id: 'vedamd-adult-malaria',
      hook: 'patient-view',
      title: 'Adult malaria — uncomplicated and severe',
      description:
        'WHO Guidelines for Malaria 2023 + Kenya NMTG. Sentinel-gated by malariaContextProvided. Critical for severe malaria features (impaired consciousness, prostration, multiple convulsions, respiratory distress, abnormal bleeding, jaundice + organ dysfunction, shock, hyperparasitaemia, hypoglycaemia <2.2, Hb <7, AKI, black-water urine, pulmonary oedema) — IV artesunate 2.4 mg/kg + supportive care. Warning for RDT-positive uncomplicated — AL with food. Info for RDT-negative. Overlays for pregnancy / HIV / G6PD.',
    },
    {
      id: 'vedamd-mhgap-psychosis-screen',
      hook: 'patient-view',
      title: 'WHO mhGAP — psychosis assessment',
      description:
        'WHO mhGAP Intervention Guide 2.0 PSY module. Critical when psychotic features present alongside escalation features (imminent harm risk, severe agitation, catatonia, refusal of food/fluid) or organic mimics (fever, recent head injury, recent substance use). Warning for first-episode or chronic pattern without escalation — start oral haloperidol or olanzapine, psychoeducation, family support, refer for specialist review within 1–2 weeks.',
    },
    {
      id: 'vedamd-anaphylaxis-recognition',
      hook: 'patient-view',
      title: 'Anaphylaxis recognition + IM adrenaline bundle',
      description:
        'WAO 2020 + Resus Council. Sentinel-gated by suspectedAllergicReaction. Critical when >=2 systems involved OR isolated cardiovascular collapse with documented allergen exposure — IM adrenaline (auto-computed paediatric 0.01 mg/kg capped at 0.5 mg when weightKg supplied) + supine + oxygen + IV crystalloid 20 mL/kg + airway monitoring + 6-hour observation. Warning for single-system urticaria with exposure.',
    },
    {
      id: 'vedamd-dka-recognition',
      hook: 'patient-view',
      title: 'Diabetic ketoacidosis (DKA) recognition + bundle',
      description:
        'JBDS / ADA + WHO PEN. Sentinel-gated by suspectedDka. Critical when the diagnostic triad (plasma glucose >=11 + acidosis pH <7.30 or HCO3 <15 + ketonaemia/ketonuria) is met — IV NaCl 0.9% staged, fixed-rate IV insulin 0.1 U/kg/h (auto-computed when weightKg supplied), potassium replacement, dextrose switch at glucose <14, treat precipitant. Additional critical card for severe DKA (pH <7.0 / HCO3 <5 / ketones >6 / GCS <=12 / shock / K <3.5). Warning for partial criteria; info for isolated hyperglycaemia.',
    },
    {
      id: 'vedamd-severe-asthma-exacerbation',
      hook: 'patient-view',
      title: 'Severe asthma / status asthmaticus',
      description:
        'GINA 2024 + WHO PEN. Sentinel-gated by knownAsthma. Critical for life-threatening features (silent chest, exhaustion, cyanosis, SpO2 <90, PEF <33%, hypotension) — continuous nebulised bronchodilators + IV magnesium + IV hydrocortisone + ICU. Critical for severe (unable to complete sentences, RR >=30, HR >=120, PEF 33–50%, SpO2 <95) — salbutamol + ipratropium + oral prednisolone. Warning for moderate. Info for controlled asthma.',
    },
    {
      id: 'vedamd-snake-bite-triage',
      hook: 'patient-view',
      title: 'Snake-bite triage + antivenom bundle',
      description:
        'WHO 2016 snake-bite guidelines + Kenya MoH. Sentinel-gated by confirmedBite. Critical for envenomation features — polyvalent antivenom 10 vials IV with adrenaline pre-loaded for reactions, atropine + neostigmine trial for neurotoxic envenomation, no NSAIDs. Warning for definite bite without envenomation features — 24-h observation with serial whole-blood clotting tests.',
    },
    {
      id: 'vedamd-syphilis-screen',
      hook: 'patient-view',
      title: 'Syphilis — screening + treatment trigger',
      description:
        'WHO STI Guidelines 2021 + Kenya MoH. Critical (mandatory antenatal offer) when pregnant AND syphilisScreenStatus !== "done". Critical (treatment) when syphilisTestPositive — early disease: benzathine penicillin 2.4 MU IM single dose; late latent / unknown: 2.4 MU IM weekly x 3; neurosyphilis: IV crystalline penicillin G 18–24 MU/day x 10–14 days. Warning for targeted offer.',
    },
    {
      id: 'vedamd-heart-failure-decompensation',
      hook: 'patient-view',
      title: 'Heart-failure acute decompensation',
      description:
        'ESC 2023 + WHO PEN-HEARTS. Sentinel-gated by suspectedHeartFailureDecompensation. Critical for cardiogenic shock / acute pulmonary oedema (SBP <90, hypoperfusion, SpO2 <90, RR >=30, pink frothy sputum) — sit upright, high-flow O2, CPAP/NIV, IV furosemide 40–80 mg, nitrate (avoid in RV infarct), noradrenaline + dobutamine for shock. Critical for decompensation (orthopnoea/PND, basal crackles, weight gain >=2 kg/3 d, raised JVP) — admit, IV diuresis, GDMT optimisation (EF-banded). Warning for early decompensation. Info for stable contact.',
    },
    {
      id: 'vedamd-viral-hepatitis-screen',
      hook: 'patient-view',
      title: 'Viral hepatitis B/C — screening + linkage',
      description:
        'WHO 2024 Hepatitis Testing & Treatment + Kenya Viral Hepatitis Strategic Plan. Critical when HBsAg-positive (treatment-naive) or HCV active — link to confirmatory testing, fibrosis staging, tenofovir / pan-genotypic DAA. Critical for pregnant + HBsAg unknown (universal antenatal offer). Warning for high-risk (PLHIV, key populations, transfusion era, HCW exposure, household contact, dialysis). Info for routine adult screen in endemic setting.',
    },
    {
      id: 'vedamd-sti-syndromic',
      hook: 'patient-view',
      title: 'STI syndromic management',
      description:
        'WHO STI 2021 + Kenya MoH syndromic algorithm. Selects ONE syndrome via suspectedStiSyndrome: urethral-discharge, vaginal-discharge, genital-ulcer, lower-abdominal-pain (PID), scrotal-swelling. Returns the recommended antimicrobial bundle (ceftriaxone + doxycycline for gonorrhoea/chlamydia; metronidazole + clotrimazole for vaginitis; benzathine penicillin + aciclovir for ulcer; ceftriaxone + doxycycline + metronidazole for PID), partner notification, and HIV + syphilis + hepatitis testing. Severe PID and unexcluded testicular torsion escalate.',
    },
    {
      id: 'vedamd-gdm-screen',
      hook: 'patient-view',
      title: 'Gestational diabetes — screen, diagnose, manage',
      description:
        'WHO 2013 + IADPSG + FIGO 2015 + Kenya MoH. Critical for overt diabetes in pregnancy (FPG >=7.0, random >=11.1, HbA1c >=6.5%) — manage as T2DM with insulin. Critical for GDM diagnosed by 75 g OGTT (fasting >=5.1, 1-h >=10.0, 2-h >=8.5) — MNT + activity, escalate to metformin/insulin if >=20% SMBG readings above target. Warning for risk factors + 24–28 weeks without OGTT. Info for routine universal offer in endemic setting.',
    },
    {
      id: 'vedamd-status-epilepticus',
      hook: 'patient-view',
      title: 'Status epilepticus / seizure management',
      description:
        'WHO mhGAP 2.0 + ILAE 2015 + Kenya MoH. Sentinel-gated by suspectedSeizure. Critical for active convulsion >=5 min or recurrent without recovery — Stage 1 lorazepam 0.1 mg/kg IV (weight-banded) or IM midazolam, Stage 2 phenytoin 20 mg/kg or sodium valproate 40 mg/kg or levetiracetam 60 mg/kg, Stage 3 intubate + midazolam infusion. Critical override for pregnancy: magnesium sulphate (eclampsia). Critical for post-ictal hypoglycaemia. Warning for first-ever seizure — investigate, do not start AED reflexively. Info for break-through seizure in known epilepsy.',
    },
    {
      id: 'vedamd-imci-measles',
      hook: 'patient-view',
      title: 'IMCI: measles in children under 5',
      description:
        'WHO IMCI 2014 + WHO Measles Treatment 2020 + Kenya MoH EPI. Sentinel-gated by suspectedMeasles. Critical for severe complicated measles (any IMCI danger sign, corneal clouding, deep mouth ulcers, severe pneumonia, severe dehydration, encephalitis, stridor) — admit, age-banded vitamin A (50 000 / 100 000 / 200 000 IU now and tomorrow), complication-specific antibiotics (ceftriaxone for severe pneumonia / encephalitis), tetracycline eye ointment for corneal clouding. Critical for measles with eye / mouth / non-severe pneumonia — outpatient bundle (vitamin A + amoxicillin + topical eye / mouth care). Warning for uncomplicated measles — vitamin A, isolation 4 days after rash onset, contact tracing within 72 h. Info for prodrome with Koplik spots or known contact.',
    },
    {
      id: 'vedamd-pmtct',
      hook: 'patient-view',
      title: 'PMTCT — Prevention of mother-to-child HIV transmission',
      description:
        'WHO 2021 consolidated HIV guidelines + Kenya NASCOP PMTCT Algorithm 2022. Critical when HIV-positive pregnant / breastfeeding and ART naive — start TLD same day, baseline VL / creatinine / CD4, plan infant prophylaxis. Critical when on ART but viral load >=1000 — intensive adherence package + drug-resistance testing + dual infant prophylaxis. Critical when HIV status unknown in pregnancy / labour / lactation — PITC today. Critical when HIV-exposed infant has not started prophylaxis — start age-banded NVP / AZT now. Warning when virally suppressed — continue TLD with scheduled VL monitoring + infant single-drug NVP 6 weeks + EID 6 w / 6 m / 12 m + final antibody at 18 m or 6 w after breastfeeding stops. Warning for HIV-negative with ongoing exposure — offer PrEP (TDF/FTC) + scheduled retesting.',
    },
    {
      id: 'vedamd-postpartum-care',
      hook: 'patient-view',
      title: 'Postpartum care — WHO 4-contact schedule + red flags',
      description:
        'WHO 2022 postnatal-care recommendations + Kenya MoH PNC guidelines. Critical for postpartum red flags within 6 weeks (heavy bleeding / PPH, fever >=38, foul lochia, postpartum hypertension >=160/110, severe headache / visual disturbance, calf pain or swelling, dyspnoea, suicidal thoughts, breast abscess) — same-day referral with cause-specific resuscitation (oxytocin + TXA for PPH, MgSO4 + labetalol for postpartum pre-eclampsia, broad-spectrum antibiotics for sepsis, LMWH for VTE, mental-health crisis pathway). Warning when first-24 h / day-3 / day-7–14 contact is overdue, or when EPDS >=13 or Hb <9 g/dL. Info for routine week-6 contact (contraception, immunisations, cervical screen offer, EPDS).',
    },
    {
      id: 'vedamd-ckd-screen',
      hook: 'patient-view',
      title: 'Chronic kidney disease — screen, stage, manage',
      description:
        'KDIGO 2024 + WHO PEN HEARTS + Kenya MoH NCD. Critical for eGFR <30 (KDIGO G4 / G5), AKI / acute features, refractory hyperkalaemia (K >=6) or severe acidosis — urgent nephrology referral + avoid nephrotoxins + hyperkalaemia bundle when applicable. Critical for heavy proteinuria (uACR >=300 mg/g, uPCR >=50 mg/mmol, dipstick +++) or rapid eGFR decline (>5 mL/min/year) — workup cause + maximally-tolerated ACE/ARB + SGLT2i where eGFR >=20 and uACR >=200. Warning for KDIGO G3 / A2 — BP <130/80 + RAAS blockade + statin + vaccinate + avoid NSAIDs / herbal. Warning for high-risk patient without current eGFR / uACR — order labs today.',
    },
    {
      id: 'vedamd-head-injury-triage',
      hook: 'patient-view',
      title: 'Severe head injury / TBI triage',
      description:
        'NICE NG232 (2023) + Brain Trauma Foundation 4th edn + WHO Acute Care + CRASH-3. Sentinel-gated by suspectedHeadInjury. Critical for severe TBI (GCS <=8) or herniation features (fixed pupil, motor posturing, Cushing\'s triad) — RSI + neuroprotective bundle + hypertonic saline / mannitol + TXA within 3 h + urgent neurosurgery referral. Critical for moderate TBI (GCS 9–12) or any NICE high-risk feature (focal deficit, >1 vomit, post-traumatic seizure, suspected open / depressed / basal skull fracture, age >=65 + LOC, anticoagulant + LOC, dangerous mechanism + LOC) — urgent CT within 1 hour + admit for neuro-obs. Warning for mild TBI with intermediate features (single LOC / amnesia / vomit, intoxication, persistent headache, suspected non-accidental injury in child) — 4 h facility observation. Info for low-risk mild TBI — discharge with written head-injury card.',
    },
    {
      id: 'vedamd-hhs-recognition',
      hook: 'patient-view',
      title: 'Hyperosmolar Hyperglycaemic State (HHS) — recognition + bundle',
      description:
        'JBDS-IP HHS Guideline 2022 + ADA Standards of Care 2024. Sentinel-gated by suspectedHhs. Critical when the diagnostic triad is met (hypovolaemia + glucose >=30 + osmolality >=320 WITHOUT significant ketonaemia or acidosis): IV 0.9% NaCl (15 mL/kg first-hour bolus), slow osmolality fall <=5 mOsm/kg/h (Na fall <=10/24 h), fixed-rate insulin 0.05 U/kg/h ONLY after 60 min of fluids + glucose stops falling, K+ replacement, prophylactic LMWH, investigate precipitant (infection, silent MI, stroke, missed therapy). Additional critical card for severe HHS (osmolality >=350, Na >=160, K outside 3.5–6.0, GCS <=12, SBP <90 after fluids, SpO2 <92) — ICU input. Warning for mixed HHS / DKA picture (high glucose + ketones).',
    },
    {
      id: 'vedamd-tb-treatment',
      hook: 'patient-view',
      title: 'Tuberculosis treatment regimens (DS-TB / RR-TB / MDR-TB / pre-XDR / XDR)',
      description:
        'WHO Consolidated Guidelines on TB Module 4 (2022 + 2024 update) + Kenya NTLD-P. Sentinel-gated by tbConfirmed. Critical for drug-susceptible pulmonary or extrapulmonary TB — 2HRZE/4HR (weight-banded 4FDC) + pyridoxine + LFT monitoring; CNS / bone TB extended to 9–12 months with prednisolone for meningitis / pericarditis; HIV co-infection start ART within 2–8 weeks with rifampicin–dolutegravir dose adjustment (DTG 50 mg BID); pregnancy safe regimen. Critical for rifampicin-resistant / MDR-TB — refer to PMDT site within 48 h for BPaL(M) 6-month all-oral regimen (bedaquiline + pretomanid + linezolid +/- moxifloxacin). Critical for pre-XDR / XDR — national reference centre individualised regimen. Notify District TB Coordinator within 24 h; trace household contacts; offer TPT to under-5s + PLHIV contacts.',
    },
    {
      id: 'vedamd-rabies-pep',
      hook: 'patient-view',
      title: 'Rabies post-exposure prophylaxis (PEP)',
      description:
        'WHO Position Paper on rabies vaccines (2018) + CDC ACIP + Kenya MoH rabies elimination strategy. Sentinel-gated by suspectedRabiesExposure. Critical for WHO Category III exposure (transdermal bite, broken-skin / mucous-membrane contamination, ANY bat exposure) — wound care 15 min wash + virucidal, rabies immunoglobulin 20 IU/kg (HRIG) infiltrated AS MUCH AS ANATOMICALLY POSSIBLE around wounds with remainder IM distant from vaccine, full vaccine course (Essen 4-dose IM days 0/3/7/14–28 OR ID Updated Thai Red Cross 0/3/7/28). Critical for Category II (minor scratch / nibble without bleeding) — wound care + vaccine course, NO RIG. Critical for re-exposure after prior full PEP / pre-exposure — abbreviated 2-dose vaccine days 0+3, NO RIG. Info for Category I (touch / feed / intact-skin lick) — no PEP unless contact uncertain. Wound tetanus prophylaxis + safe in pregnancy / breastfeeding / immunocompromised patients.',
    },
    {
      id: 'vedamd-neonatal-jaundice',
      hook: 'patient-view',
      title: 'Neonatal jaundice — AAP 2022 thresholds + acute bilirubin encephalopathy',
      description:
        'AAP 2022 Clinical Practice Guideline Revision (>=35 weeks) + WHO Pocket Book of Hospital Care for Children + Kenya MoH Newborn Care. Critical for acute bilirubin encephalopathy (lethargy/hypertonia/retrocollis/shrill cry/seizures) — intensive phototherapy + prepare exchange transfusion. Critical for jaundice in the first 24 h of life (ALWAYS pathological) — admit, TSB + DAT + blood group + G6PD + sepsis screen, phototherapy. Critical when TSB >= AAP exchange-transfusion threshold for postnatal age + risk profile — double-volume exchange transfusion. Critical when TSB >= phototherapy threshold — intensive phototherapy (>=30 µW/cm²/nm). Warning for "watch zone" (within 2 mg/dL of threshold or rise > 0.2 mg/dL/h) — repeat in 6–12 h. Warning for prolonged jaundice (>14 d term, >21 d preterm) — measure split bilirubin, screen for biliary atresia / hypothyroidism / UTI / breastmilk jaundice.',
    },
    {
      id: 'vedamd-sickle-cell-crisis',
      hook: 'patient-view',
      title: 'Sickle-cell disease — vaso-occlusive crisis + complications',
      description:
        'ASH 2020 SCD Acute & Chronic Pain Guidelines + NHLBI 2014 Evidence-Based Management of SCD + Kenya MoH Sickle-Cell Disease Guideline 2019. Sentinel-gated by sickleCellDisease. Critical for life-threatening SCD emergency (acute chest syndrome, stroke, priapism >4 h, splenic sequestration, aplastic crisis, sepsis with fever, severe anaemia Hb <5) — admit, oxygen, isotonic fluids at maintenance (avoid overload — risk of ACS), IV morphine 0.1 mg/kg titrated, broad-spectrum antibiotics within 1 h for fever, exchange transfusion for stroke / severe ACS / refractory priapism. Critical for vaso-occlusive pain crisis — analgesia within 30 min, screen for precipitants, optimise hydroxyurea, incentive spirometry, avoid over-hydration. Warning for chronic-care gaps (no hydroxyurea, missing penicillin V <5 y, missing pneumococcal/influenza/Hib/meningococcal vaccines, no annual transcranial Doppler 2–16 y, no retinal screen ≥10 y, no folic-acid 5 mg daily). Info for stable patient on guideline-directed therapy.',
    },
    {
      id: 'vedamd-dengue-arboviral',
      hook: 'patient-view',
      title: 'Dengue / chikungunya / Zika — arboviral fever triage',
      description:
        'WHO Dengue Guidelines 2009 + 2024 update + PAHO 2022 + CDC Clinical Guidance. Sentinel-gated by suspectedArboviralFever. Critical for severe dengue (Group C — shock with narrow pulse pressure or SBP <90, AST/ALT >=1000, GCS <=13, AKI, mucosal bleeding with platelets <20): admit HDU/ICU, isotonic crystalloid 10–20 mL/kg over 1 h titrated down, colloid for refractory leakage, transfuse packed cells for occult bleeding (NO prophylactic platelets/FFP), strictly NO NSAIDs / aspirin. Critical for warning signs (Group B — abdominal pain, persistent vomiting, fluid accumulation, mucosal bleeding, lethargy, hepatomegaly, rapid platelet fall, haematocrit rise >=20%): admit IV fluids 5–7 mL/kg/h titrated, 4-hourly observations through critical phase (days 3–7). Critical override for suspected Zika in pregnancy — refer maternal-foetal medicine for serial scans. Warning for uncomplicated Group A — outpatient supportive care, daily review, paracetamol ONLY, never NSAIDs.',
    },
    {
      id: 'vedamd-schistosomiasis-treatment',
      hook: 'patient-view',
      title: 'Schistosomiasis — treatment + complications + MDA eligibility',
      description:
        'WHO Guideline on Control and Elimination of Human Schistosomiasis (2022) + CDC + Kenya MoH National Schistosomiasis & STH. Sentinel-gated by suspectedSchistosomiasis. Critical for complicated disease (neuroschistosomiasis, portal-hypertension variceal bleed, massive haematuria with shock, obstructive uropathy) — admit + specialist referral + prednisolone 1 mg/kg for neuroschisto BEFORE praziquantel. Critical for Katayama fever (acute schistosomiasis 4–8 weeks post-exposure: fever + urticaria + eosinophilia) — prednisolone 1 mg/kg x 5–7 days FIRST then defer praziquantel 6–12 weeks. Critical for confirmed infection — praziquantel 40 mg/kg single dose (60 mg/kg for S. japonicum / mekongi) with food; pregnancy >=14 weeks is safe (WHO 2006/2022); recheck eggs / antigen at 8–12 weeks. Warning for high clinical suspicion without confirmation — send tests + empirical praziquantel reasonable in endemic settings. Info for MDA eligibility — yearly praziquantel for school-age in endemic communities (WHO 2022 expands to preschool + adults in >=10% prevalence).',
    },
    {
      id: 'vedamd-imci-ear-infection',
      hook: 'patient-view',
      title: 'IMCI: ear infection in children under 5 (AOM / CSOM / mastoiditis)',
      description:
        'WHO IMCI Chart Booklet 2014 + WHO Pocket Book of Hospital Care for Children + AAP Clinical Practice Guideline AOM 2013 + Kenya MoH IMCI. Sentinel-gated by suspectedEarProblem + ageMonths < 60. Critical for mastoiditis (tender swelling behind the ear) — admit, IV ceftriaxone 50 mg/kg + metronidazole if intracranial extension, urgent ENT review, contrast CT/MRI temporal bone. Critical for AOM (pus <14 days or bulging tympanic membrane + ear pain) — oral amoxicillin 80–90 mg/kg/day for 5–10 days; co-amoxiclav for first-line failure; AAP-watchful-waiting allowed in age >=2 unilateral without otorrhoea; macrolide for IgE penicillin allergy. Warning for CSOM (pus >=14 days) — dry wicking + topical ciprofloxacin drops, NOT oral antibiotics (WHO). Info for no infection — reassure + vaccinate (PCV + influenza reduce recurrent AOM).',
    },
    {
      id: 'vedamd-neonatal-sepsis',
      hook: 'patient-view',
      title: 'Neonatal sepsis / Possible Serious Bacterial Infection (PSBI)',
      description:
        'WHO Managing Possible Serious Bacterial Infection in Young Infants When Referral is Not Feasible (2015) + WHO Pocket Book of Hospital Care for Children (2nd edn) + Kenya MoH National Newborn Care Guidelines. Sentinel-gated by suspectedNeonatalSepsis (age 0–28 days). Critical for PSBI features (unable to feed since birth, stopped feeding, convulsions, movement only when stimulated, severe chest indrawing, grunting, RR >=60, temperature >=38 or <35.5, bulging fontanelle, neck stiffness) — within 1 hour: ampicillin 50 mg/kg IV/IM every 12 h (week 1) or every 8 h (week 2+) + gentamicin 5 mg/kg IM/IV once daily for 10–14 days; add ceftriaxone (or cefotaxime if jaundiced / premature) when meningitis suspected; full sepsis screen + LP when stable; refer to neonatal admission within 1 h (when referral not possible WHO 2015 simplified outpatient regimen: IM gentamicin + oral amoxicillin x 7 days with daily review). Warning for risk-factor screen (maternal chorioamnionitis, PROM >18 h, intrapartum fever, GBS+ without IAP, prematurity <35 wks) in a well infant — admit 48 h observation + culture-driven decision. Info for well infant — routine PNC + WHO danger-signs counselling.',
    },
    {
      id: 'vedamd-heat-stroke',
      hook: 'patient-view',
      title: 'Heat stroke / heat-related illness',
      description:
        'CDC NIOSH Heat-Related Illness clinical guidance + WHO Heat and Health technical brief + Korey-Stringer Institute Consensus + NEJM 2019 Heat-Related Illnesses review. Sentinel-gated by suspectedHeatIllness. Critical for heat stroke (core temperature >=40 °C OR >=39 °C with CNS dysfunction — confusion, ataxia, seizures, coma): RAPID COOLING within 30 min is the primary intervention — exertional heat stroke COLD-WATER IMMERSION (head out, monitored, target rectal <=39 °C in 30 min); classic heat stroke evaporative cooling (continuous fanning + wet skin); ice packs to neck/axillae/groin; AVOID antipyretics; IV 0.9% NaCl 20 mL/kg titrated; rhabdomyolysis bundle for dark urine / CK > 5x ULN; ICU admission. Critical for severe heat exhaustion with red flags (SBP <90, repeated vomiting, Na <=130 or >=150, creatinine >200, suspected rhabdomyolysis) — admit, IV fluids, escalate if core temp climbs / CNS develops. Warning for heat exhaustion — move to cool, oral / IV rehydration, rest, observe. Info for heat-exposure risk — WHO counselling on hydration / work-rest cycles / cool environments.',
    },
    {
      id: 'vedamd-vte-prophylaxis',
      hook: 'patient-view',
      title: 'VTE prophylaxis — Padua Prediction Score',
      description:
        'ASH 2018 / Barbar 2010. Sentinel-gated by medicalInpatient. Computes the Padua score (active cancer 3, previous VTE 3, reduced mobility 3, thrombophilia 3, recent trauma/surgery 2, age ≥70 1, cardiac/respiratory failure 1, acute MI/stroke 1, acute infection/rheumatological 1, obesity BMI ≥30 1, ongoing hormonal 1). Score ≥4 → offer pharmacological thromboprophylaxis (enoxaparin/fondaparinux) UNLESS a high-bleeding-risk flag is present, in which case it recommends mechanical prophylaxis + daily reassessment. Deterministic — removes mis-scoring that misses preventable PE or over-anticoagulates.',
    },
    {
      id: 'vedamd-ugib-blatchford',
      hook: 'patient-view',
      title: 'Upper GI bleed — Glasgow-Blatchford Score',
      description:
        'NICE CG141. Sentinel-gated by suspectedUpperGiBleed (or haematemesis / melaena). Computes the Glasgow-Blatchford Score from urea, sex-specific haemoglobin, systolic BP, pulse, melaena, syncope, hepatic disease + cardiac failure. GBS 0 → consider outpatient with early endoscopy; ≥1 → admit; ≥6 → high risk, urgent endoscopy + restrictive transfusion + variceal cover. Flags any missing inputs (score is a minimum until completed). Deterministic arithmetic — removes manual scoring error that could discharge an actively bleeding patient.',
    },
    {
      id: 'vedamd-afib-anticoag',
      hook: 'patient-view',
      title: 'Atrial fibrillation — CHA₂DS₂-VASc + HAS-BLED anticoagulation',
      description:
        'ESC AF 2024. Sentinel-gated by hasAtrialFibrillation (or "atrial fibrillation" in context.diagnoses). Computes the CHA₂DS₂-VASc stroke score (CHF, hypertension, age ≥75 [2], diabetes, prior stroke/TIA [2], vascular disease, age 65–74, female) and the HAS-BLED bleeding score. Recommends a DOAC when score ≥2 (men) / ≥3 (women); considers it at 1 (men) / 2 (women); none at 0 (men) / 1 (women, sex alone). Flags valvular AF (mechanical valve / moderate–severe mitral stenosis) for warfarin. HAS-BLED ≥3 prompts addressing modifiable bleeding factors, NOT withholding anticoagulation. Deterministic arithmetic — removes manual scoring error.',
    },
    {
      id: 'vedamd-alcohol-withdrawal',
      hook: 'patient-view',
      title: 'Alcohol withdrawal — CIWA-Ar protocol',
      description:
        'NICE CG100 / ASAM 2020. Sentinel-gated by suspectedAlcoholWithdrawal (or a supplied ciwaScore). Sums the 10 CIWA-Ar items (nausea/vomiting, tremor, paroxysmal sweats, anxiety, agitation, tactile/auditory/visual disturbances, headache 0–7 each; orientation/clouding 0–4) for a 0–67 total. <8 → minimal, monitor + oral thiamine; 8–15 → moderate withdrawal, symptom-triggered diazepam/chlordiazepoxide + parenteral thiamine BEFORE glucose; >15 → severe, high benzodiazepine requirement + delirium-tremens vigilance. Escalates to critical (ICU / DT pathway) when seizure history, hallucinations, or autonomic instability accompany a high score. Deterministic arithmetic — removes mis-scoring that under-treats withdrawal (seizures/DTs) or over-sedates.',
    },
    {
      id: 'vedamd-pneumonia-curb65',
      hook: 'patient-view',
      title: 'Community-acquired pneumonia — CURB-65 + antibiotic choice',
      description:
        'BTS CAP 2009/2015 / IDSA 2019. Sentinel-gated by suspectedPneumonia (adults ≥18). Computes the full CURB-65 (confusion, urea > 7 mmol/L, respiratory rate ≥30, systolic <90 or diastolic ≤60, age ≥65) — the hospital-grade companion to CRB-65 that adds the urea criterion. 0–1 → outpatient amoxicillin; 2 → ward amoxicillin + macrolide; ≥3 → admit, IV co-amoxiclav + macrolide, assess for ICU. Antibiotic choices are AWaRe-tagged; flags missing inputs as a minimum score and treats low SpO₂ as an admission trigger. Deterministic arithmetic — removes scoring error that under-treats severe pneumonia or over-admits.',
    },
    {
      id: 'vedamd-stemi-fibrinolysis',
      hook: 'patient-view',
      title: 'STEMI — fibrinolysis vs PCI reperfusion pathway',
      description:
        'ESC STEMI 2023 / AHA 2022. Sentinel-gated by an ECG-confirmed STEMI (stEcgFinding = "stemi" or suspectedStemi). Deterministically chooses reperfusion: primary PCI when a PCI-capable centre is reachable within 120 min; otherwise immediate fibrinolysis (tenecteplase/streptokinase, door-to-needle ≤10 min) within 12 h of onset then transfer for PCI in 2–24 h. Runs a fibrinolysis contraindication checklist (active bleeding, recent stroke/surgery, BP >180/110) and diverts to emergency PCI transfer when present; flags onset >12 h. Always critical — STEMI is time-dependent.',
    },
    {
      id: 'vedamd-hiv-pep',
      hook: 'patient-view',
      title: 'HIV post-exposure prophylaxis (PEP)',
      description:
        'WHO 2024 / CDC. Sentinel-gated by an exposure (exposureType or suspectedHivExposure). Gates on the 72-hour window and source HIV status: within 72 h and source positive/unknown → start TDF + 3TC/FTC + DTG once daily × 28 days (renal-adjusted backbone if eGFR <50) with baseline, 6-week and 3-month testing; >72 h → outside window, switch to testing + PrEP counselling; source confirmed negative → PEP not indicated. Deterministic time/serostatus gate — prevents missed or futile prophylaxis.',
    },
    {
      id: 'vedamd-hiv-first-line',
      hook: 'patient-view',
      title: 'HIV first-line ART (TLD)',
      description:
        'WHO 2024. Sentinel-gated by a positive HIV status or new ART initiation. Recommends TLD (TDF + 3TC + DTG) once daily for adults/adolescents ≥30 kg, with two safety overlays: rifampicin co-treatment → add supplementary DTG 50 mg 12 h after TLD; HBsAg-positive → mandatory tenofovir-containing backbone, no abrupt interruption. Flags <30 kg for weight-band paediatric dosing. Deterministic regimen selection with interaction/co-infection guards.',
    },
    {
      id: 'vedamd-mdr-tb-regimen',
      hook: 'patient-view',
      title: 'MDR/RR-TB all-oral regimen builder (BPaL/M)',
      description:
        'WHO MDR-TB Operational Handbook 2022 / TB-PRACTECAL. Sentinel-gated by RIF-resistance/MDR in drugResistance. Suggests BPaLM (bedaquiline + pretomanid + linezolid + moxifloxacin) for fluoroquinolone-susceptible disease, or BPaL when FQ resistance is present. Hard QT gate: QTcF > 500 ms → critical, hold QT-prolonging drugs. Surfaces mandatory monitoring — baseline + serial ECG (additive QT), monthly LFTs, weekly FBC + visual + neurological screen (linezolid). Deterministic eligibility + safety scaffolding.',
    },
    {
      id: 'vedamd-cryptococcal-induction',
      hook: 'patient-view',
      title: 'Cryptococcal meningitis induction therapy',
      description:
        'WHO 2022 / AMBITION-cm. Sentinel-gated by a positive cryptococcal antigen (crAg) with meningitis. Emits the WHO-preferred induction — single high-dose liposomal amphotericin B 10 mg/kg + flucytosine 100 mg/kg/day + fluconazole 1200 mg/day × 14 days — with the amphotericin B deoxycholate fallback where liposomal is unavailable. Flags raised CSF opening pressure (≥25 cmH₂O) for therapeutic LP drainage and lists electrolyte/creatinine/FBC monitoring + delayed ART. Always critical.',
    },
    {
      id: 'vedamd-snake-envenomation-treatment',
      hook: 'patient-view',
      title: 'Snake envenomation — antivenom protocol',
      description:
        'WHO Africa snakebite guidelines. Sentinel-gated by systemic envenomation features or an incoagulable 20-minute WBCT (or suspectedSnakebite for the observation pathway). With systemic signs → polyvalent antivenom 50–100 mL slow IV with adrenaline/steroid/antihistamine ready for anaphylaxis, re-dosing every 1–2 h until coagulopathy/neurotoxicity reverses, plus supportive care and the do-NOT list (no tourniquet/incision). Without systemic signs → observe ≥24 h with 6-hourly WBCT/neuro checks. Deterministic indication gate.',
    },
    {
      id: 'vedamd-uti-treatment',
      hook: 'patient-view',
      title: 'Uncomplicated UTI — empirical therapy',
      description:
        'NICE NG109 / WHO AWaRe. Sentinel-gated by suspectedUti. Routes by sex, pregnancy, trimester and renal function: non-pregnant women → 3-day nitrofurantoin (eGFR ≥45) or trimethoprim; pregnancy → nitrofurantoin in 1st/2nd trimester, cefalexin near term, avoid trimethoprim in the 1st trimester, send culture; men → 7-day course + investigate (treated as complicated). AWaRe-tagged Access choices. Deterministic — encodes the contraindications that cause prescribing error.',
    },
    {
      id: 'vedamd-asthma-step-up',
      hook: 'patient-view',
      title: 'Asthma — GINA stepwise therapy',
      description:
        'GINA 2024 Track 1 (ICS-formoterol). Sentinel-gated by asthma in diagnoses (or suspectedAsthma). Recommends the GINA step from current step + control markers (reliever ≥3 days/week, night-waking, control status), stepping up after checking technique/adherence/triggers and flagging Step 5 for severe-asthma referral. Enforces GINA’s core safety rule — never SABA-only, every step includes ICS. Deterministic stepwise logic.',
    },
    {
      id: 'vedamd-anaemia-iron',
      hook: 'patient-view',
      title: 'Iron-deficiency anaemia — replacement pathway',
      description:
        'BSH 2021. Sentinel-gated by a supplied haemoglobin (auto g/dL→g/L). Confirms iron deficiency from ferritin (<30 µg/L) / TSAT (<20%), estimates the Ganzoni iron deficit from weight, and routes between alternate-day oral ferrous sulphate (hepcidin-optimised first-line) and IV ferric carboxymaltose for intolerance, malabsorption, CKD anaemia, IBD, pregnancy ≥14 weeks, or severe symptomatic anaemia (Hb <70 → consider transfusion). Prompts source investigation and recheck schedule.',
    },
    {
      id: 'vedamd-hypothyroidism-init',
      hook: 'patient-view',
      title: 'Hypothyroidism — levothyroxine initiation',
      description:
        'ATA 2014 + pregnancy guidance. Sentinel-gated by a supplied TSH. Treats overt disease (TSH >10) and selectively treats subclinical disease (TSH 4–10) when symptomatic, pregnant or planning fertility. Dose logic: full replacement 1.6 µg/kg/day in the young without cardiac disease; start 25 µg low-and-slow in elderly/IHD; pregnancy → tight TSH <2.5 target with an immediate ~30% dose increase on confirmed pregnancy. Recheck TSH at 6–8 weeks (4-weekly in pregnancy). Deterministic threshold + dosing.',
    },
  ];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
    private readonly knowledge: KnowledgeService,
    private readonly registry: CdsStrategyRegistry,
  ) {}

  listServices(): CdsServiceDescriptor[] {
    return this.services;
  }

  capabilityStatement(): StatelessCapability {
    const extUrl = this.config.get('stateless.capabilityExtensionUrl', { infer: true });
    return {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString(),
      publisher: 'VedaMD',
      kind: 'instance',
      software: { name: 'vedamd-api', version: '0.1.0' },
      description:
        'VedaMD is a stateless Clinical Decision Support API. It accepts patient context per request, evaluates clinical rules in memory, and persists no PHI.',
      extension: [{ url: extUrl, valueBoolean: true }],
    };
  }

  async evaluateHook(serviceId: string, req: CdsHookRequest): Promise<CdsHookResponse> {
    const start = process.hrtime.bigint();
    const known = this.services.find((s) => s.id === serviceId);

    const cards: CdsCard[] = [];
    let rulesEvaluated = 0;
    let rulesFired = 0;

    if (known) {
      const applicableRules = this.knowledge
        .getCdsRules()
        .filter(
          (rule) =>
            rule.hook === known.hook &&
            (rule.services === undefined || rule.services.includes(known.id)),
        );

      for (const rule of applicableRules) {
        const strategy = this.registry.get(rule.type);
        if (!strategy) continue;
        rulesEvaluated += 1;
        try {
          const ruleCards = await strategy.evaluate(rule, req);
          if (ruleCards.length > 0) rulesFired += 1;
          for (const card of ruleCards) {
            mergeRuleCodings(card, rule.codings);
            // Anti-hallucination guardrail: propagate the underlying
            // rule's review status into every card so the consuming UI
            // can render a DRAFT / UNDER REVIEW / DEPRECATED banner.
            // Cards generated from unreviewed content MUST be visually
            // flagged — clinicians need a signal that the guideline
            // synthesis is provisional. See conditions.types.ts for
            // the four canonical statuses.
            const ext = card.extension?.['http://vedamd.io/Card/recommendation'];
            if (ext && !ext.reviewStatus) {
              ext.reviewStatus = rule.reviewStatus;
            }
          }
          cards.push(...ruleCards);
        } catch (e) {
          // A failing rule must never bring down the whole evaluation.
          // Log PHI-free and continue.
          this.log.info('cds_hook_evaluated', {
            endpoint: `POST /cds-services/${serviceId}`,
            hook: req.hook,
            rule_id: rule.id,
            rule_version: rule.ruleVersion,
            error_category: 'internal',
            cards_returned_count: 0,
            latency_ms: 0,
            status_code: 500,
            message: (e as Error).message,
          });
        }
      }
    }

    const latencyMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    this.log.info('cds_hook_evaluated', {
      endpoint: `POST /cds-services/${serviceId}`,
      hook: req.hook,
      rule_id: serviceId,
      rule_version: '0.0.0',
      rules_evaluated: rulesEvaluated,
      fired: rulesFired,
      cards_returned_count: cards.length,
      latency_ms: latencyMs,
      status_code: known ? 200 : 404,
    });
    return { cards };
  }

  async evaluateGeneric(_payload: unknown): Promise<{ recommendations: unknown[] }> {
    return { recommendations: [] };
  }
}

/**
 * Merge the rule-level `codings` (from the signed content bundle)
 * into a card's recommendation extension. Strategy-level codings
 * win on conflicts (case-specific overrides like "severe-dengue"
 * vs the rule's generic "dengue" ICD); deduplication is by
 * `system + code`.
 */
function mergeRuleCodings(card: CdsCard, ruleCodings: CdsRuleCodingArray): void {
  if (!ruleCodings || ruleCodings.length === 0) return;
  const ext = card.extension?.['http://vedamd.io/Card/recommendation'];
  if (!ext) return;
  const existing = ext.codings ?? [];
  const seen = new Set(existing.map((c) => `${c.system}|${c.code}`));
  const merged = [...existing];
  for (const coding of ruleCodings) {
    const key = `${coding.system}|${coding.code}`;
    if (seen.has(key)) continue;
    merged.push(coding);
    seen.add(key);
  }
  ext.codings = merged;
}

type CdsRuleCodingArray = NonNullable<CdsCard['extension']>['http://vedamd.io/Card/recommendation']['codings'];
