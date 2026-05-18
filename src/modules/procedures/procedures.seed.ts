import type { ProcedureGuidance } from './procedures.types';

/**
 * v0.1 placeholder content. NOT clinical guidance — these records exist
 * to exercise the schema and the API surface end-to-end. Real content
 * flows through the Knowledge Content Service (SRS §6.3.2) under
 * multi-reviewer approval and cryptographic signing (FR-024, FR-025).
 * Every record is marked review_status='draft'.
 */
export const SEED_PROCEDURES: ProcedureGuidance[] = [
  {
    slug: 'lumbar-puncture-adult',
    title: 'Diagnostic lumbar puncture (adult)',
    domains: ['emergency', 'neurology', 'procedure'],
    population: { minAgeYears: 18, sex: 'any' },
    indications: [
      'Suspected meningitis or encephalitis.',
      'Suspected subarachnoid haemorrhage with negative CT.',
      'Diagnostic work-up of suspected demyelinating or autoimmune neurological disease.',
    ],
    contraindications: {
      absolute: [
        'Clinical signs of raised intracranial pressure or impending herniation.',
        'Infection at the proposed puncture site.',
      ],
      relative: [
        'Coagulopathy (INR > 1.5) or platelet count < 50 × 10⁹/L.',
        'Therapeutic anticoagulation not withheld.',
        'Spinal deformity making landmarks unreliable.',
      ],
    },
    equipment: [
      'Sterile gloves and drape.',
      'Skin preparation (chlorhexidine 2% or povidone-iodine).',
      'Spinal needle 20–22 G with introducer.',
      'Three-way tap and manometer for opening pressure.',
      'Four sterile collection tubes (cell count, biochemistry, microbiology, additional).',
      'Local anaesthetic (1% lignocaine) with 5 mL syringe.',
    ],
    consentNotes:
      'Counsel the patient on indication, common side effects (post-dural-puncture headache), serious risks (bleeding, infection, neurological injury, brainstem herniation if unrecognised raised ICP), and alternatives. Document consent.',
    steps: [
      {
        step: 'Confirm no contraindications',
        detail: 'Review fundoscopy, focal neurology, coagulation. Image first when uncertain.',
        safetyCheck: 'STOP if any sign of raised ICP, focal deficit, or recent seizure without imaging.',
      },
      {
        step: 'Position the patient',
        detail: 'Left lateral decubitus with knees drawn up and back fully flexed, or seated and leaning forward.',
      },
      {
        step: 'Identify landmarks',
        detail: 'Intercristal line crosses the L4 spinous process; aim for L3–L4 or L4–L5 interspace.',
      },
      {
        step: 'Prep and drape',
        detail: 'Sterile technique throughout; widely prep the area.',
        safetyCheck: 'Confirm sterility of the field before opening the needle.',
      },
      {
        step: 'Anaesthetise the skin and deeper tissues',
        detail: 'Raise a wheal then infiltrate down toward the interspinous ligament.',
      },
      {
        step: 'Insert the spinal needle',
        detail: 'Bevel parallel to dural fibres; advance toward the umbilicus until a give signals dural puncture.',
      },
      {
        step: 'Measure opening pressure',
        detail: 'Connect the manometer with the patient in the lateral decubitus position with legs extended.',
        safetyCheck: 'If pressure > 25 cmH₂O, remove only the minimum CSF needed and escalate.',
      },
      {
        step: 'Collect CSF',
        detail: 'Fill four tubes (≈ 1–2 mL each) for cell count, biochemistry (protein, glucose; paired serum glucose), microbiology (Gram stain, culture, viral PCR), and storage.',
      },
      {
        step: 'Withdraw the needle and dress',
        detail: 'Withdraw with stylet replaced; apply a sterile dressing.',
      },
    ],
    redFlags: [
      'New focal neurology or altered consciousness during or after the procedure.',
      'Persistent CSF leak.',
      'Worsening headache with neck stiffness or fever post-procedure.',
    ],
    postProcedureCare: [
      'Encourage oral fluids.',
      'Bed rest is no longer routinely required for post-dural-puncture headache prevention.',
      'Document opening pressure and CSF appearance.',
    ],
    complications: [
      {
        complication: 'Post-dural-puncture headache',
        severity: 'minor',
        management: 'Hydration, simple analgesia, caffeine; epidural blood patch if persistent and disabling.',
      },
      {
        complication: 'Bleeding (spinal haematoma)',
        severity: 'major',
        management: 'Urgent neurosurgical assessment, MRI spine, reversal of anticoagulation as indicated.',
      },
      {
        complication: 'Cerebral herniation',
        severity: 'major',
        management: 'Avoid by screening for raised ICP first. If suspected post-procedure, resuscitate, intubate, and seek immediate neurosurgical input.',
      },
    ],
    references: [{ label: 'Kenya Clinical Guidelines — Diagnostic procedures' }],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'iv-cannulation-peripheral-adult',
    title: 'Peripheral IV cannulation (adult)',
    domains: ['emergency', 'general-practice', 'procedure', 'nursing'],
    population: { minAgeYears: 12, sex: 'any' },
    indications: [
      'Intravenous medication or fluid administration.',
      'Blood sampling at the time of cannulation.',
    ],
    contraindications: {
      absolute: ['Cellulitis or infection at the chosen site.'],
      relative: [
        'Limb with arteriovenous fistula in use for dialysis.',
        'Lymphoedematous or post-mastectomy limb on the affected side.',
        'Burns or skin breakdown at the site.',
      ],
    },
    equipment: [
      'Disposable gloves.',
      'Tourniquet.',
      'Skin preparation (chlorhexidine 2% in 70% alcohol).',
      'Cannula of appropriate gauge (typically 18–20 G for adults).',
      'Sterile transparent dressing.',
      'Pre-filled saline flush.',
      'Sharps bin within reach.',
    ],
    consentNotes:
      'Explain the procedure, indication, expected sensation, and risks (bruising, infection, infiltration). Verbal consent is usually sufficient.',
    steps: [
      {
        step: 'Hand hygiene and gloves',
        detail: 'Standard precautions throughout.',
      },
      {
        step: 'Select the site',
        detail: 'Prefer distal sites first (dorsum of hand → forearm). Avoid joints when possible.',
      },
      {
        step: 'Apply tourniquet',
        detail: 'Place 10–15 cm proximal to the chosen vein; do not occlude arterial flow.',
        safetyCheck: 'Confirm distal pulse remains palpable.',
      },
      {
        step: 'Clean the skin',
        detail: 'Single firm wipe; allow to air-dry fully (~30 seconds).',
      },
      {
        step: 'Insert the cannula',
        detail: 'Anchor the vein with the non-dominant hand; insert bevel up at ~15–30°; advance until flashback; then advance the plastic cannula off the stylet.',
      },
      {
        step: 'Release tourniquet, withdraw stylet',
        detail: 'Discard the stylet immediately into the sharps bin.',
        safetyCheck: 'Do not re-sheath needles.',
      },
      {
        step: 'Flush the cannula',
        detail: 'Use 5–10 mL saline; confirm no resistance and no swelling at the site.',
      },
      {
        step: 'Secure with a transparent dressing',
        detail: 'Document date, site, and gauge.',
      },
    ],
    redFlags: [
      'Bright red pulsatile flashback — suspect arterial cannulation; remove and apply pressure.',
      'Pain on flush, swelling, or pallor — likely infiltration; remove the cannula.',
    ],
    postProcedureCare: [
      'Re-site every 72–96 hours or sooner if any sign of phlebitis.',
      'Document each shift with a phlebitis score.',
    ],
    complications: [
      {
        complication: 'Phlebitis',
        severity: 'minor',
        management: 'Remove cannula; warm compress; consider re-siting on the contralateral limb.',
      },
      {
        complication: 'Cellulitis',
        severity: 'major',
        management: 'Remove cannula; oral or IV antibiotics per local guideline; review for systemic features.',
      },
      {
        complication: 'Arterial puncture',
        severity: 'major',
        management: 'Withdraw immediately; apply firm pressure for at least 5 minutes; observe for haematoma.',
      },
    ],
    references: [{ label: 'WHO Best Practices for Injections and Related Procedures Toolkit' }],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'wound-cleaning-and-simple-suturing',
    title: 'Wound cleaning and simple interrupted suturing',
    domains: ['emergency', 'general-practice', 'procedure'],
    population: { minAgeYears: 1, sex: 'any' },
    indications: ['Clean, recent (< 6–8 hours) laceration not involving deep structures.'],
    contraindications: {
      absolute: [
        'Heavily contaminated bite or puncture wound — clean and leave open.',
        'Suspected tendon, nerve, or vascular injury — refer.',
      ],
      relative: [
        'Wound on cosmetically sensitive area (e.g. face) — consider specialist closure.',
        'Significant tissue loss — consider secondary intention or specialist input.',
      ],
    },
    equipment: [
      'Sterile gloves and drape.',
      'Skin prep and saline for irrigation.',
      'Local anaesthetic (lignocaine 1%) with adrenaline contraindicated at digits / penis / nose / ears.',
      'Needle holder, toothed forceps, scissors.',
      'Suture material — typically 4-0 to 6-0 non-absorbable monofilament.',
      'Sterile dressing.',
    ],
    consentNotes:
      'Explain wound assessment findings, anaesthetic, expected scar, and risk of infection. Confirm tetanus immunisation status.',
    steps: [
      {
        step: 'Assess the wound',
        detail: 'Examine for foreign body, tendon, nerve, vascular involvement; document distal neurovascular status.',
        safetyCheck: 'STOP and refer if deeper structures are involved or there is uncontrolled bleeding.',
      },
      {
        step: 'Anaesthetise',
        detail: 'Infiltrate the wound edges. Wait at least 5 minutes for full effect.',
      },
      {
        step: 'Irrigate copiously',
        detail: 'At least 100 mL of saline per cm of wound; remove all visible debris.',
      },
      {
        step: 'Place simple interrupted sutures',
        detail: 'Take equal bites either side; evert the wound edges; space sutures approximately equal to the bite width.',
      },
      {
        step: 'Dress and document',
        detail: 'Dry dressing; document wound size, depth, suture count, anaesthetic dose used.',
      },
    ],
    redFlags: [
      'Bleeding that does not stop with pressure — suspect arterial involvement.',
      'Loss of distal sensation or motor function after anaesthetic effect should wear off — suspect nerve injury.',
    ],
    postProcedureCare: [
      'Keep the wound dry for 48 hours.',
      'Suture removal — face 5 days, scalp 7–10 days, limbs 10–14 days.',
      'Review at 48 hours if any concern for infection.',
    ],
    complications: [
      {
        complication: 'Wound infection',
        severity: 'minor',
        management: 'Remove sutures if collection present; clean; oral antibiotics per local guideline.',
      },
      {
        complication: 'Dehiscence',
        severity: 'minor',
        management: 'Re-clean; allow healing by secondary intention or re-suture if early and clean.',
      },
      {
        complication: 'Tetanus',
        severity: 'major',
        management: 'Prevent — confirm immunisation status; give tetanus toxoid ± immunoglobulin per protocol.',
      },
    ],
    references: [{ label: 'Kenya Clinical Guidelines — Minor surgical procedures' }],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'urinary-catheterisation-adult-male',
    title: 'Urethral urinary catheterisation (adult male)',
    domains: ['general-practice', 'procedure', 'nursing'],
    population: { minAgeYears: 18, sex: 'male' },
    indications: [
      'Acute urinary retention.',
      'Accurate urine output monitoring in critical illness.',
      'Bladder drainage peri-operatively when indicated.',
    ],
    contraindications: {
      absolute: ['Suspected urethral trauma (blood at the meatus, perineal haematoma, high-riding prostate).'],
      relative: [
        'Recent urological surgery — discuss with the urology team.',
        'Known urethral stricture — anticipate difficulty; consider smaller-gauge catheter or urology input.',
      ],
    },
    equipment: [
      'Sterile catheterisation pack with drapes and gloves.',
      'Antiseptic cleansing solution.',
      'Lignocaine-chlorhexidine lubricating gel.',
      'Foley catheter 14–16 Fr.',
      'Sterile water for balloon inflation.',
      'Drainage bag.',
    ],
    consentNotes:
      'Explain indication, alternatives, expected discomfort, and risks (infection, bleeding, urethral trauma, false passage). Confirm consent and chaperone.',
    steps: [
      {
        step: 'Position and prepare',
        detail: 'Supine; clean drape; sterile field.',
      },
      {
        step: 'Clean the meatus and surrounding skin',
        detail: 'Retract the foreskin; clean from meatus outward.',
      },
      {
        step: 'Instil anaesthetic lubricant',
        detail: '10 mL of lignocaine-chlorhexidine gel into the urethra; allow ≥ 3 minutes for effect.',
        safetyCheck: 'Skipping the wait substantially increases pain and urethral trauma.',
      },
      {
        step: 'Pass the catheter',
        detail: 'Hold the penis vertical at first; insert until urine returns plus 2–3 cm more before inflating balloon.',
      },
      {
        step: 'Inflate the balloon',
        detail: 'With 10 mL sterile water — only after free urine return.',
        safetyCheck: 'STOP and withdraw if inflation causes pain — the balloon may be in the urethra.',
      },
      {
        step: 'Connect drainage and reposition foreskin',
        detail: 'Replace the foreskin to prevent paraphimosis.',
        safetyCheck: 'Failing to reposition the foreskin is a common, preventable harm.',
      },
      {
        step: 'Document',
        detail: 'Insertion difficulty, residual volume, catheter size and date.',
      },
    ],
    redFlags: [
      'Bleeding per urethra during the procedure — STOP; suspect false passage.',
      'No urine return despite advancing the catheter into the bladder — verify position before inflating.',
    ],
    postProcedureCare: [
      'Hourly output monitoring as clinically indicated.',
      'Daily review for ongoing indication — remove as soon as no longer needed (CAUTI prevention).',
    ],
    complications: [
      {
        complication: 'Catheter-associated urinary tract infection',
        severity: 'minor',
        management: 'Remove the catheter if able; collect a culture; treat per local guideline.',
      },
      {
        complication: 'Urethral trauma / false passage',
        severity: 'major',
        management: 'Stop; do not re-attempt; refer to urology for cystoscopy-guided catheterisation.',
      },
      {
        complication: 'Paraphimosis',
        severity: 'major',
        management: 'Manual reduction with cold compress; urology referral if irreducible.',
      },
    ],
    references: [
      { label: 'WHO Guidelines on Core Components of Infection Prevention and Control Programmes' },
    ],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
];
