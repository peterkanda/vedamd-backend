#!/usr/bin/env node
/**
 * Auto-classify every reference in the signed content bundle by source
 * strength, using a 4-tier rubric:
 *
 *   A — International guideline body, government regulator, Cochrane
 *       review, or named top-tier peer-reviewed journal (NEJM, Lancet,
 *       JAMA, BMJ family, AHA Journals, AAP Pediatrics, top society
 *       journals like Eur Heart J, Diabetologia, etc.). Highest trust.
 *   B — Peer-reviewed specialty publication or recognised formulary
 *       (OUP/Wiley/Elsevier journals, BNF/BNFc/CKS, LactMed, LiverTox,
 *       Sanford Guide, Briggs). Strong trust.
 *   C — Other authoritative reference: society educational materials,
 *       NCBI Bookshelf reviews (StatPearls), academic-centre protocols,
 *       country sub-national references. Acceptable supporting reference.
 *   D — Consumer / wiki / encyclopedic source (Wikipedia, WebMD,
 *       Healthline, Patient.info, drugs.com aggregator pages). Allowed
 *       BUT clearly labeled — clinicians see the lower strength and
 *       calibrate trust accordingly. Should never be the SOLE reference
 *       for a clinical recommendation.
 *
 * Why scoring rather than blocking: the user-facing badge tells
 * clinicians exactly how authoritative each source is, which is more
 * transparent than an editorial blocklist. It also makes mixed
 * reference lists (one A-tier guideline + one D-tier Wikipedia overview
 * link for context) explicit. Copyright posture is unchanged — we
 * never reproduce source text, only link to it.
 *
 * Heuristic:
 *   1. URL host classification (the primary signal — host tells you
 *      almost everything).
 *   2. Fallback to label keywords (when there's no URL, or the host
 *      isn't on our table — e.g. journal name in the label).
 *   3. Default: 'C' (conservative — never optimistic).
 *
 * Idempotent: re-running over a bundle that already has `strength`
 * leaves existing values alone unless `--rewrite` is passed.
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '../content/bundles/v0.1.0');
const rewrite = process.argv.includes('--rewrite');

// --- Tier A: international guideline, regulator, top-tier peer-review ---
const A_HOST_PATTERNS = [
  /^who\.int$/, /^iris\.who\.int$/, /\.who\.int$/, /^www\.who\.int$/, /^aware\.essentialmeds\.org$/,
  /^(?:www\.)?cdc\.gov$/, /^clinicalinfo\.hiv\.gov$/,
  /^(?:www\.)?fda\.gov$/, /^accessdata\.fda\.gov$/, /^www\.accessdata\.fda\.gov$/,
  /^(?:www\.)?ema\.europa\.eu$/,
  /^(?:www\.)?nice\.org\.uk$/, /^bnf\.nice\.org\.uk$/, /^cks\.nice\.org\.uk$/,
  /^(?:www\.)?sign\.ac\.uk$/,
  /^kdigo\.org$/, /^(?:www\.)?kdigo\.org$/,
  /^(?:www\.)?nejm\.org$/,
  /^(?:www\.)?thelancet\.com$/,
  /^jamanetwork\.com$/, /^(?:www\.)?jamanetwork\.com$/,
  /(?:^|\.)bmj\.com$/,
  /^(?:www\.)?ahajournals\.org$/,
  /^(?:www\.)?cochranelibrary\.com$/,
  /^publications\.aap\.org$/,
  /^(?:www\.)?idsociety\.org$/,
  /^(?:www\.)?escardio\.org$/,
  /^(?:www\.)?easl\.eu$/, /^easl\.eu$/,
  /^(?:www\.)?eular\.org$/,
  /^(?:www\.)?gov\.uk$/, /\.nhs\.uk$/,
  /^(?:www\.)?resus\.org\.uk$/, /^cprguidelines\.eu$/,
  /^(?:www\.)?eso-stroke\.org$/, /^world-heart-federation\.org$/,
  /^(?:www\.)?fsrh\.org$/, /^(?:www\.)?rcog\.org\.uk$/, /^(?:www\.)?rcophth\.ac\.uk$/,
  /^(?:www\.)?rcn\.org\.uk$/, /^(?:www\.)?rcp\.ac\.uk$/, /^(?:www\.)?rcpch\.ac\.uk$/,
  /^(?:www\.)?rcpsych\.ac\.uk$/, /^(?:www\.)?rcr\.ac\.uk$/, /^rcem\.ac\.uk$/,
  /^(?:www\.)?brit-thoracic\.org\.uk$/, /^(?:www\.)?bashh\.org$/, /^(?:www\.)?bad\.org\.uk$/,
  /^(?:www\.)?bsg\.org\.uk$/, /^(?:www\.)?bsh\.org\.uk$/, /^b-s-h\.org\.uk$/,
  /^(?:www\.)?rheumatology\.org\.uk$/, /^(?:www\.)?boa\.ac\.uk$/, /^(?:www\.)?entuk\.org$/,
  /^anaesthetists\.org$/, /^ficm\.ac\.uk$/,
  /^(?:www\.)?heart\.org$/, /^(?:www\.)?acc\.org$/, /^(?:www\.)?jacc\.org$/,
  /^(?:www\.)?diabetes\.org$/, /^diabetesjournals\.org$/, /^thebms\.org\.uk$/,
  /^(?:www\.)?aafp\.org$/, /^(?:www\.)?acog\.org$/, /^(?:www\.)?figo\.org$/,
  /^(?:www\.)?acep\.org$/, /^(?:www\.)?sccm\.org$/, /^(?:www\.)?aao\.org$/,
  /^(?:www\.)?aap\.org$/, /^(?:www\.)?chestnet\.org$/, /^(?:www\.)?ascopubs\.org$/,
  /^ginasthma\.org$/, /^(?:www\.)?diabetes\.org\.uk$/, /^(?:www\.)?lung\.org$/,
  /^(?:www\.)?worldgastroenterology\.org$/, /^(?:www\.)?ecco-ibd\.eu$/,
  /^(?:www\.)?rheumatology\.org$/, /^(?:www\.)?thyroid\.org$/, /^(?:www\.)?ispad\.org$/,
  /^(?:www\.)?ilae\.org$/, /^(?:www\.)?eaaci\.org$/, /^(?:www\.)?worldallergy\.org$/,
  /^(?:www\.)?iasp-pain\.org$/, /^(?:www\.)?movementdisorders\.org$/, /^psychiatryonline\.org$/,
  /^(?:www\.)?aasm\.org$/, /^aasm\.org$/, /^(?:www\.)?aasld\.org$/,
  /^(?:www\.)?hematology\.org$/, /^(?:www\.)?facs\.org$/,
  /^(?:www\.)?atsjournals\.org$/, /^(?:www\.)?thoracic\.org$/,
  /^(?:www\.)?nutritionhealth\.or\.ke$/, /^nascop\.or\.ke$/, /^nltp\.co\.ke$/,
  /\.health\.go\.ke$/, /\.kemri\.org$/, /^(?:www\.)?gavi\.org$/, /^(?:www\.)?unaids\.org$/,
  /^iris\.paho\.org$/, /^crediblemeds\.org$/, /^(?:www\.)?crediblemeds\.org$/,
  /^(?:www\.)?hiv-druginteractions\.org$/, /^hiv-druginteractions\.org$/,
  /^(?:www\.)?who-umc\.org$/, /^whocc\.no$/, /^(?:www\.)?whocc\.no$/,
  /^(?:www\.)?iarc\.who\.int$/, /^(?:www\.)?endocrine\.org$/, /^(?:www\.)?endocrinology\.org$/,
  /^iwgdfguidelines\.org$/, /^(?:www\.)?cff\.org$/, /^(?:www\.)?ahajournals\.org$/,
  /^(?:www\.)?asra\.com$/, /^(?:www\.)?aagbi\.org$/, /^das\.uk\.com$/,
  /^(?:www\.)?nogg\.org\.uk$/, /^thebms\.org\.uk$/, /^postpartumfp\.srhr\.org$/,
  /^(?:www\.)?bfmed\.org$/, /^(?:www\.)?ihi\.org$/, /^(?:www\.)?tracheostomy\.org\.uk$/,
  /^(?:www\.)?bapras\.org\.uk$/, /^(?:www\.)?baus\.org\.uk$/, /^(?:www\.)?auanet\.org$/,
  /^uroweb\.org$/, /^(?:www\.)?surviving-sepsis\.org$/, /^acsearch\.acr\.org$/,
  /^(?:www\.)?acr\.org$/, /^(?:www\.)?jacr\.org$/, /^pubs\.rsna\.org$/,
  /^(?:www\.)?theabn\.org$/, /^(?:www\.)?bsac\.org\.uk$/, /^ascnuk\.com$/,
  /^braintrauma\.org$/, /^ameriburn\.org$/, /^(?:www\.)?wms\.org$/,
  /^(?:www\.)?mhaus\.org$/, /^(?:www\.)?dgrh\.de$/, /^ichd-3\.org$/,
  /^(?:www\.)?palliativecareguidelines\.scot\.nhs\.uk$/,
  /^(?:www\.)?scottishmedicines\.org\.uk$/, /^(?:www\.)?epilepsy\.org\.uk$/,
  /^(?:www\.)?epilepsy\.com$/, /^(?:www\.)?eshre\.eu$/, /^(?:www\.)?eugs\.org$/,
  /^(?:www\.)?aabb\.org$/, /^(?:www\.)?scai\.org$/, /^(?:www\.)?tctmd\.com$/,
  /^(?:www\.)?ejves\.com$/, /^(?:www\.)?journal-of-hepatology\.eu$/, /^gut\.bmj\.com$/,
  /^(?:www\.)?fresno\.ucsf\.edu$/, /^(?:www\.)?ukkidney\.org$/, /^ukkidney\.org$/,
  /^(?:www\.)?ghspjournal\.org$/, /^(?:www\.)?annalsofoncology\.org$/,
  /^(?:www\.)?amjtransplant\.org$/, /^(?:www\.)?amjmed\.com$/,
  /^(?:www\.)?journals?\.lww\.com$/, /^(?:www\.)?cmaj\.ca$/,
  /^(?:www\.)?clinicalmicrobiologyandinfection\.com$/, /^(?:www\.)?antt\.org$/,
  /^(?:www\.)?dacas\.org\.au$/, /^(?:www\.)?medinfogalway\.ie$/,
  /^(?:www\.)?icrc\.org$/, /^(?:www\.)?msf\.org$/, /^(?:www\.)?unhcr\.org$/,
  /^(?:www\.)?karger\.com$/, /^karger\.com$/, /^(?:www\.)?ebmj\.com$/,
  /^(?:www\.)?sps\.nhs\.uk$/, /^pharmaceutical-journal\.com$/, /^(?:www\.)?ema\.europa\.eu$/,
  /^(?:www\.)?gi\.org$/, /^geriatricpain\.org$/, /^(?:www\.)?bfmed\.org$/,
];

// --- Tier B: peer-reviewed publishers, formulary, NIH-managed knowledge bases ---
const B_HOST_PATTERNS = [
  /^academic\.oup\.com$/,
  /^onlinelibrary\.wiley\.com$/,
  /^link\.springer\.com$/, /\.springer\.com$/,
  /^journals\.sagepub\.com$/,
  /^sciencedirect\.com$/, /^www\.sciencedirect\.com$/,
  /^ashpublications\.org$/, /^pubs\.asha\.org$/,
  /^pubmed\.ncbi\.nlm\.nih\.gov$/, /^pmc\.ncbi\.nlm\.nih\.gov$/,
  /^(?:www\.)?ncbi\.nlm\.nih\.gov$/, // NCBI Bookshelf review articles
  /^(?:www\.)?liebertpub\.com$/, /^journals\.physiology\.org$/,
  /^wjes\.biomedcentral\.com$/, /^(?:www\.)?frontiersin\.org$/,
  /^(?:www\.)?merckmanuals\.com$/, // Merck Manual professional — high quality, multi-author
  /^(?:www\.)?cell\.com$/, /^(?:www\.)?nature\.com$/, /^ascopubs\.org$/,
  /^(?:www\.)?monash\.edu$/, /^uihc\.org$/, /^(?:www\.)?healthcare\.uiowa\.edu$/,
  /^(?:www\.)?pfizermedical\.com$/, // Pharma medical-information; regulatory-grade for the cited drug
  /^journals\.asm\.org$/, /^(?:www\.)?uspharmacopeia\.org$/,
  /^(?:www\.)?uspreventiveservicestaskforce\.org$/, // USPSTF — could be A; conservative as B
  /^(?:www\.)?ebnh-cardiology\.com$/, /^(?:www\.)?contemporaryobgyn\.net$/,
  /^(?:www\.)?mdcalc\.com$/, /^mchatscreen\.com$/,
  /^abcd\.care$/, /^(?:www\.)?abcd\.care$/,
  /^(?:www\.)?spinalcord\.org$/, /^(?:www\.)?facialnerve\.org$/,
  /^goldcopd\.org$/, /^(?:www\.)?goldcopd\.org$/,
  /^toxbase\.org$/, /^(?:www\.)?toxbase\.org$/,
  /^snomed\.info$/, /^hl7\.org$/, /^loinc\.org$/, // terminology authorities
  /^(?:www\.)?jahonline\.org$/, /^(?:www\.)?jaci-inpractice\.org$/,
  /^handbook\.ggcmedicines\.org\.uk$/,
  /^(?:www\.)?rr-africa\.woah\.org$/, // World Org for Animal Health — for zoonoses
];

// --- Label keywords (used when URL is missing or host unclear) ---
const A_LABEL = [
  // Global
  /\bWHO\b/i, /World Health Organi[sz]ation/i, /Cochrane Review/i, /Cochrane Database/i,
  // National regulators
  /\bFDA\b/i, /Food and Drug Admin/i, /accessdata\.fda\.gov/i, /\bEMA\b/i, /European Medicines Agency/i,
  /SmPC/i, /MHRA Drug Safety/i, /MHRA Public Assessment/i, /\bMHRA\b/, /Health Canada/i, /TGA Australia/i,
  // National-level guideline bodies
  /\bNICE\b/, /\bSIGN\b/, /\bCKS\b/, /Public Health England/i, /UK Health Security Agency/i, /UKHSA/,
  /Green Book/i, /\bBNF\b/, /\bBNFc\b/, /British National Formulary/i,
  /KDIGO/i, /Surviving Sepsis/i,
  // Top peer-review
  /\bNEJM\b/, /N Engl J Med/i, /\bLancet\b/, /\bJAMA\b/, /\bBMJ\b/, /\bCirculation\b/,
  /Eur Heart J/i, /\bJACC\b/, /J Am Coll Cardiol/i, /Pediatrics 20\d\d/, /Pediatrics 19\d\d/,
  /Diabetologia/, /Diabetes Care/i, /Diabetes 20\d\d/, /Br J Anaesth/i, /\bBJA\b/,
  /Clin Infect Dis/i, /\bAm J Med\b/, /\bAJM\b/, /Ann Intern Med/i, /\bAJRCCM\b/,
  /Am J Respir Crit Care Med/i, /Crit Care Med/i, /Intensive Care Med/i,
  // Society codes (any year)
  /\bIDSA\b/, /\bESC\b/, /\bAHA\b/, /\bACC\b/, /\bACR\b/, /\bACOG\b/, /\bACOEM\b/, /\bACG\b/,
  /\bAAP\b/, /\bAAOS\b/, /\bASCO\b/, /\bASH\b/, /\bATS\b/, /\bERS\b/, /\bASRA\b/, /\bASRM\b/,
  /\bACEP\b/, /\bENLS\b/, /\bWFSA\b/, /\bAAFP\b/, /\bASA\b/,
  /\bRCOG\b/, /\bRCPCH\b/, /\bRCPsych\b/, /\bRCEM\b/, /\bRCP\b/, /\bRCR\b/, /\bRCN\b/,
  /\bRCS\b/, /\bRCPath\b/, /\bRCOphth\b/, /\bGMC\b/,
  /\bEULAR\b/, /\bEAACI\b/, /\bBSACI\b/, /\bBSAC\b/, /\bBASHH\b/, /\bBHIVA\b/, /\bBNA\b/, /\bBOA\b/,
  /\bBSR\b/, /\bBSG\b/, /\bBTS\b/, /\bBSH\b/, /\bBAD\b/,
  /\bAASLD\b/, /\bEASL\b/, /\bACG\b/, /\bWGO\b/, /\bECCO\b/, /\bAACE\b/, /\bATA\b/, /\bAES\b/,
  /\bISPAD\b/, /\bIDF\b/, /\bADA\b 20\d\d/, /\bAPA\b 20\d\d/, /\bWHO MEC\b/,
  /\bACIP\b/, /\bWHO IVB\b/, /\bWHO HIV\b/, /\bWHO TB\b/,
  /\bASHP\b/, /\bSIDP\b/, /\bPIDS\b/, /\bSCCM\b/, /\bPADIS\b/, /\bFICM\b/, /\bWMS\b/,
  /\bGOLD\b/, /\bGINA\b/, /\bILAE\b/, /\bIASP\b/, /\bIASP\b/, /\bABM\b/,
  /\bAASM\b/, /\bIWGDF\b/, /\bMDS\b/, /\bIDF\b/, /\bWHF\b/, /\bESO\b/, /\bWFNS\b/,
  /\bSCAI\b/, /\bABA\b/, /\bMHAUS\b/, /\bBTF\b/, /\bICRC\b/, /\bMSF\b/, /\bACR\b/,
  // KE
  /\bMOH\b Kenya/i, /Kenya Ministry of Health/i, /Kenya MoH/i, /KEMRI/i, /NASCOP/i, /\bKEML\b/,
  /Kenya Essential Med/i, /Kenya National Med/i, /Kenya guidelines/i, /KEPI/i,
  // WHO publications
  /WHO Guidelines/i, /WHO Model Formulary/i, /WHO Essential Med/i, /WHO Pocket Book/i,
  /WHO Recommendations/i, /WHO IMCI/i, /WHO ANC/i, /WHO Treatment Guidelines/i,
  /WHO IGAB/i, /WHO IGRA/i, /WHO PEN/i,
  // FDA/EMA labels
  /FDA prescribing information/i, /US prescribing information/i, /Product Monograph/i,
];

const B_LABEL = [
  // Recognised formularies / reference compendia
  /Briggs.*Drugs in Pregnancy/i, /Sanford Guide/i, /Goodman & Gilman/i, /\bLactMed\b/i,
  /\bLiverTox\b/i, /Palliative Care Formulary/i, /\bPCF\b/, /Royal Marsden Manual/i,
  /Harrison's Principles/i, /Cecil Textbook/i, /Up\s?To\s?Date/i, /\bMicromedex\b/i, /\bLexicomp\b/i,
  /\bDynaMed\b/i, /\bClinical Pharmacology\b/i, /\bMerck Manual\b/i,
  // Subspecialty / regional peer-reviewed journals (very partial — anything cited "et al" pattern)
  /\bet al\.?\s*[A-Z][^.]+\.\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:19|20)\d{2}/, // generic "X et al. Title. Journal YEAR"
  /Pediatr Allergy Immunol/i, /Curr Opin Allergy Clin Immunol/i, /Clin Ther/i,
  /Ann Allergy Asthma Immunol/i, /Clin Transl Allergy/i, /Allergy 20\d\d/i, /\bJACI\b/i,
  /J Allergy Clin Immunol/i, /Br J Clin Pharmacol/i, /Clin Pharmacol Ther/i,
  /Clin Pharmacokinet/i, /Drug Saf/i, /\bDrugs\b 20\d\d/, /\bPharmacotherapy\b 20\d\d/,
  /Antimicrob Agents Chemother/i, /J Antimicrob Chemother/i, /Eur J Clin Pharmacol/i,
  /Br J Anaesth/i, /Anesth Analg/i, /Anesthesiology/i, /Anaesthesia 20\d\d/i,
  /J Pediatr/i, /Pediatr Pulmonol/i, /Pediatr Crit Care Med/i, /Pediatr Infect Dis J/i,
  /Eur Respir J/i, /Chest 20\d\d/i, /Stroke 20\d\d/i, /Heart 20\d\d/i,
  /J Hepatol/i, /Hepatology 20\d\d/, /Hepatology 19\d\d/,
  /\bGut\b 20\d\d/, /Gastroenterology 20\d\d/, /Am J Gastroenterol/i,
  /Nephron 20\d\d/, /Nephron 19\d\d/, /Kidney Int 20\d\d/, /Am J Kidney Dis/i,
  /Endocrine 20\d\d/, /J Clin Endocrinol Metab/i, /\bJCEM\b/,
  /Acta Paediatr 20\d\d/, /Arch Dis Child/i, /\bADC\b 20\d\d/,
  /Resuscitation 20\d\d/, /Crit Care 20\d\d/, /Eur Geriatr Med/i,
  /Antibiotics 20\d\d/i, /Lancet Infect Dis/i, /Lancet Diabetes Endocrinol/i,
  /Lancet Respir Med/i, /Lancet Neurol/i, /Lancet Oncol/i, /Lancet Glob Health/i,
  /Lancet Child Adolesc Health/i, /Lancet Psychiatry/i,
  /\bMed Lett Drugs Ther\b/, /\bClin Toxicol\b/, /J Med Toxicol/i,
  /\bPostgrad Med J\b/, /Postgraduate Med/i,
  /Drug Intell Clin Pharm/i, /Aliment Pharmacol Ther/i, /Arthritis Rheum/i, /Arthritis Care Res/i,
  /Rheumatology 20\d\d/i, /Rheumatology 19\d\d/i, /Bone 20\d\d/i, /Bone 19\d\d/i,
  /JAMA Pediatr/i, /JAMA Cardiol/i, /JAMA Oncol/i, /JAMA Intern Med/i, /JAMA Neurol/i,
  /JAMA Psychiatry/i, /JAMA Surg/i, /JAMA Otolaryngol/i, /JAMA Ophthalmol/i,
];

// --- Tier D: consumer/wiki/encyclopedic sources ---
// Allowed but explicitly scored low so the UI can warn clinicians.
const D_HOST_PATTERNS = [
  /(?:^|\.)wikipedia\.org$/, /(?:^|\.)wikimedia\.org$/, /(?:^|\.)wikidoc\.org$/,
  /(?:^|\.)webmd\.com$/, /(?:^|\.)healthline\.com$/, /(?:^|\.)patient\.info$/,
  /(?:^|\.)drugs\.com$/, /(?:^|\.)medlineplus\.gov$/,
  /(?:^|\.)mayoclinic\.org$/, // patient-education arm
  /(?:^|\.)nhs\.uk\/conditions$/, // NHS patient-info (rare; specific path)
  /(?:^|\.)medscape\.com$/, // news/aggregator
  /(?:^|\.)physio-pedia\.com$/, // wiki model
  /(?:^|\.)everydayhealth\.com$/, /(?:^|\.)patient\.com$/, /(?:^|\.)nhsinform\.scot\/illnesses/,
];
const D_LABEL = [
  /\bWikipedia\b/i, /\bWikimedia\b/i, /\bWebMD\b/i, /\bHealthline\b/i, /\bPatient\.info\b/i,
];

function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function classifyOne(ref) {
  const url = (ref.url || '').toString();
  const label = (ref.label || '').toString();
  const host = hostOf(url);

  // D (consumer / wiki) checked FIRST so a Wikipedia link doesn't sneak
  // into A on a label keyword.
  if (host) {
    for (const p of D_HOST_PATTERNS) if (p.test(host)) return 'D';
  }
  for (const p of D_LABEL) if (p.test(label)) return 'D';

  if (host) {
    for (const p of A_HOST_PATTERNS) if (p.test(host)) return 'A';
    for (const p of B_HOST_PATTERNS) if (p.test(host)) return 'B';
  }
  for (const p of A_LABEL) if (p.test(label)) return 'A';
  for (const p of B_LABEL) if (p.test(label)) return 'B';
  return 'C';
}

let updated = 0;
let perTier = { A: 0, B: 0, C: 0, D: 0 };

function visit(node) {
  if (Array.isArray(node)) {
    for (const item of node) visit(item);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.references)) {
    for (const ref of node.references) {
      if (!ref || typeof ref !== 'object') continue;
      const had = ref.strength;
      if (!rewrite && (had === 'A' || had === 'B' || had === 'C')) {
        perTier[had] += 1;
        continue;
      }
      const tier = classifyOne(ref);
      ref.strength = tier;
      perTier[tier] += 1;
      updated += 1;
    }
  }
  for (const k of Object.keys(node)) {
    if (k !== 'references') visit(node[k]);
  }
}

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'manifest.json') continue;
  const fp = path.join(dir, f);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const before = updated;
  visit(data);
  if (updated > before) {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
    console.log(`  ${f}: +${updated - before} refs scored`);
  }
}

const totalTiered = perTier.A + perTier.B + perTier.C + perTier.D;
console.log(`\nTotal refs scored: ${updated}`);
console.log(
  `Tier distribution: A=${perTier.A}  B=${perTier.B}  C=${perTier.C}  D=${perTier.D}`,
);
console.log(`Tier-A share: ${((perTier.A / totalTiered) * 100).toFixed(1)}%`);
console.log(`Tier-D share: ${((perTier.D / totalTiered) * 100).toFixed(1)}%`);
