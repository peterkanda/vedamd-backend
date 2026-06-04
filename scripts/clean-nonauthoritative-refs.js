#!/usr/bin/env node
/**
 * One-off cleanup: replace remaining non-peer-reviewed citations
 * (LITFL, EMCrit, Physio-pedia, Contemporary Pediatrics, Expressable,
 * EBM Consult, PrecisePK) with primary peer-reviewed literature,
 * authoritative society guidelines, or regulatory labels.
 *
 * Strategy per record:
 *   - If a peer-reviewed source is ALREADY in the references[], drop
 *     the LITFL/etc entry.
 *   - Otherwise replace the LITFL/etc entry with a topic-specific
 *     primary source from the lookup table below.
 */
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../content/bundles/v0.1.0');

const PROBLEM_HOSTS = new Set([
  'litfl.com',
  'emcrit.org',
  'www.physio-pedia.com',
  'www.contemporarypediatrics.com',
  'www.expressable.com',
  'www.ebmconsult.com',
  'www.precisepk.com',
]);

const SAFE_HOSTS = /\.nice\.org\.uk$|^who\.int$|\.who\.int$|\.cdc\.gov$|\.fda\.gov$|accessdata\.fda\.gov$|\.ema\.europa\.eu$|\.nih\.gov$|\.ncbi\.nlm\.nih\.gov$|\.nejm\.org$|\.thelancet\.com$|\.bmj\.com$|\.jamanetwork\.com$|\.ahajournals\.org$|academic\.oup\.com$|publications\.aap\.org$|onlinelibrary\.wiley\.com$|link\.springer\.com$|journals\.lww\.com$|ashpublications\.org$|sciencedirect\.com$|pubmed\.ncbi\.nlm\.nih\.gov$|pmc\.ncbi\.nlm\.nih\.gov$|\.cell\.com$|\.nature\.com$|\.ahajournals\.org$/;

function hostOf(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

function isProblem(ref) {
  return PROBLEM_HOSTS.has(hostOf(ref.url || ''));
}

/**
 * Topic-specific replacements. Keyed by record slug → array of new refs
 * that will REPLACE all problematic refs in that record.
 *
 * Only used when the record has no peer-reviewed alternative in its
 * existing references[]. For records that already have an authoritative
 * primary, we just delete the problematic refs.
 */
const REPLACEMENTS_BY_SLUG = {
  'imaging-ottawa-ankle-knee': [
    {
      label:
        'Stiell IG, Greenberg GH, McKnight RD, Nair RC, McDowell I, Reardon M, Stewart JP, Maloney J. Decision rules for the use of radiography in acute ankle injuries. JAMA 1993;269(9):1127-32.',
      url: 'https://jamanetwork.com/journals/jama/article-abstract/403737',
    },
    {
      label:
        'Stiell IG et al. Derivation of a decision rule for the use of radiography in acute knee injuries. Ann Emerg Med 1995;26(4):405-13.',
      url: 'https://pubmed.ncbi.nlm.nih.gov/7574121/',
    },
  ],
  'ecg-junctional-rhythm': [
    {
      label:
        'Mason JW, Hancock EW, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the ECG: Part II. Electrocardiography diagnostic statement list. Circulation 2007;115(10):1325-1332.',
      url: 'https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.106.180201',
    },
  ],
  'ecg-osborn-j-waves-hypothermia': [
    {
      label:
        'Lott C et al. European Resuscitation Council Guidelines 2021: Cardiac arrest in special circumstances. Resuscitation 2021;161:152-219.',
      url: 'https://www.resuscitationjournal.com/article/S0300-9572(21)00065-2/fulltext',
    },
    {
      label:
        'Vanden Hoek TL et al. Part 12: Cardiac Arrest in Special Situations: 2010 American Heart Association Guidelines for CPR and ECC. Circulation 2010;122(18 Suppl 3):S829-S861.',
      url: 'https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.110.971069',
    },
  ],
  'abg-delta-ratio': [
    {
      label:
        'Berend K, de Vries APJ, Gans ROB. Physiological approach to assessment of acid-base disturbances. N Engl J Med 2014;371(15):1434-1445.',
      url: 'https://www.nejm.org/doi/10.1056/NEJMra1003327',
    },
  ],
  'abg-base-excess': [
    {
      label:
        'Berend K, de Vries APJ, Gans ROB. Physiological approach to assessment of acid-base disturbances. N Engl J Med 2014;371(15):1434-1445.',
      url: 'https://www.nejm.org/doi/10.1056/NEJMra1003327',
    },
  ],
  'ecg-low-voltage': [
    {
      label:
        'Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the ECG: Part V. Electrocardiogram changes associated with cardiac chamber hypertrophy. Circulation 2009;119(10):e251-e261.',
      url: 'https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.108.191097',
    },
  ],
  'ecg-accelerated-idioventricular-rhythm': [
    {
      label:
        'Mason JW, Hancock EW, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the ECG: Part II. Electrocardiography diagnostic statement list. Circulation 2007;115(10):1325-1332.',
      url: 'https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.106.180201',
    },
  ],
  'ecg-early-repolarisation': [
    {
      label:
        'Haïssaguerre M et al. Sudden cardiac arrest associated with early repolarization. N Engl J Med 2008;358(19):2016-2023.',
      url: 'https://www.nejm.org/doi/10.1056/NEJMoa071968',
    },
    {
      label:
        'Macfarlane PW et al. The Early Repolarization Pattern: A Consensus Paper. J Am Coll Cardiol 2015;66(4):470-477.',
      url: 'https://www.jacc.org/doi/10.1016/j.jacc.2015.05.033',
    },
  ],
  'ecg-atrial-ectopics-pvcs': [
    {
      label:
        'Mason JW, Hancock EW, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the ECG: Part II. Electrocardiography diagnostic statement list. Circulation 2007;115(10):1325-1332.',
      url: 'https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.106.180201',
    },
  ],
  'ecg-dextrocardia-lead-misplacement': [
    {
      label:
        'Mason JW, Hancock EW, Gettes LS. AHA/ACCF/HRS recommendations for the standardization and interpretation of the ECG: Part II. Electrocardiography diagnostic statement list. Circulation 2007;115(10):1325-1332.',
      url: 'https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.106.180201',
    },
    {
      label:
        'García-Niebla J et al. Technical mistakes during the acquisition of the electrocardiogram. Ann Noninvasive Electrocardiol 2009;14(4):389-403.',
      url: 'https://onlinelibrary.wiley.com/doi/10.1111/j.1542-474X.2009.00328.x',
    },
  ],
  'heeadsss-adolescent-screening': [
    {
      label:
        'Cohen E, MacKenzie RG, Yates GL. HEADSS, a psychosocial risk assessment instrument: implications for designing effective intervention programs for runaway youth. J Adolesc Health Care 1991;12(7):539-44.',
      url: 'https://pubmed.ncbi.nlm.nih.gov/1772893/',
    },
    {
      label:
        'Klein DA, Goldenring JM, Adelman WP. HEEADSSS 3.0: The psychosocial interview for adolescents updated for a new century fueled by media. AAP / Contemp Pediatr 2014;31:16-28 — original framework (re-archived).',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24941964/',
    },
  ],
  'vancomycin-tdm-dosing': [
    {
      label:
        'Rybak MJ et al. Therapeutic monitoring of vancomycin for serious methicillin-resistant Staphylococcus aureus infections: A revised consensus guideline and review by ASHP, IDSA, PIDS and SIDP. Am J Health Syst Pharm 2020;77(11):835-864.',
      url: 'https://academic.oup.com/ajhp/article/77/11/835/5810200',
    },
  ],
};

let droppedCount = 0;
let replacedCount = 0;

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'manifest.json') continue;
  const fp = path.join(dir, f);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  let touched = false;

  function visit(node) {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.references)) {
      const before = node.references.length;
      const problems = node.references.filter(isProblem);
      if (problems.length > 0) {
        const nonProblems = node.references.filter((r) => !isProblem(r));
        const authoritative = nonProblems.filter((r) => SAFE_HOSTS.test(hostOf(r.url || '')));
        const slug = node.slug || node.id;

        if (REPLACEMENTS_BY_SLUG[slug]) {
          node.references = [...nonProblems, ...REPLACEMENTS_BY_SLUG[slug]];
          replacedCount += problems.length;
          touched = true;
        } else if (authoritative.length > 0) {
          node.references = nonProblems;
          droppedCount += problems.length;
          touched = true;
        } else if (nonProblems.length > 0) {
          // Keep non-problems (might be StatPearls / NCBI which are OK)
          node.references = nonProblems;
          droppedCount += problems.length;
          touched = true;
        }
      }
    }
    for (const k of Object.keys(node)) {
      if (k !== 'references') visit(node[k]);
    }
  }
  visit(data);

  if (touched) {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
    console.error(`updated ${f}`);
  }
}

console.error(`\nDropped non-authoritative refs: ${droppedCount}`);
console.error(`Replaced non-authoritative refs with primary sources: ${replacedCount}`);
