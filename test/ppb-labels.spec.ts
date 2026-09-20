import { describe, expect, it } from 'vitest';
import type { DrugRecord } from '../src/modules/drugs/drugs.types';
import { matchSmpcLinks, parseRegisterPage, parseSmpcIndex, ppbDate } from '../scripts/lib/ppb';

/**
 * Kenya PPB link matching. Fixtures are synthetic markup mirroring the page
 * structure (not copied PPB content). A wrong link sends a clinician to another
 * product's SmPC, so the exclusion rules are pinned here.
 */

const row = (id: number, title: string, file: string) => `
  <tr id="table_15_row_${id}" data-row-index="${id}">
    <td style="">${id + 1}</td>
    <td style="">${title}</td>
    <td style="">${file}</td>
    <td style=""><a href="https://products.pharmacyboardkenya.org/uploads/${encodeURIComponent(file)}" rel="" target="_self"><button class="">Click Here to View SMPC</button></a></td>
  </tr>`;

function drug(slug: string, inn: string, tradeNames: string[] = [], route = 'oral'): DrugRecord {
  return {
    slug,
    inn,
    tradeNames,
    atc: [],
    dosing: { adult: [{ route, regimen: '' }] },
  } as unknown as DrugRecord;
}

const drugs = [
  drug('paracetamol', 'paracetamol', ['Panadol']),
  drug('amoxicillin', 'amoxicillin'),
  drug('co-amoxiclav', 'amoxicillin + clavulanic acid', ['Augmentin']),
  drug('moxifloxacin', 'moxifloxacin'),
  drug('artemether-lumefantrine', 'artemether + lumefantrine', ['Coartem']),
];

const entry = (title: string) => ({
  title,
  url: `https://products.pharmacyboardkenya.org/uploads/${encodeURIComponent(title)}.pdf`,
});
const linksFor = (title: string) =>
  matchSmpcLinks(drugs, [entry(title)]).map((l) => `${l.slug}:${l.confidence}`);

describe('parseSmpcIndex', () => {
  it('reads title + PDF URL per row and dedupes repeated links', () => {
    const html = `<table>${row(0, 'Brand A 500', 'Brand A 500.pdf')}${row(1, 'ALPHA_TABS', 'ALPHA_TABS_CTD1.pdf')}${row(2, 'dup', 'Brand A 500.pdf')}</table>`;
    expect(parseSmpcIndex(html)).toEqual([
      {
        title: 'Brand A 500',
        url: 'https://products.pharmacyboardkenya.org/uploads/Brand%20A%20500.pdf',
      },
      {
        title: 'ALPHA_TABS',
        url: 'https://products.pharmacyboardkenya.org/uploads/ALPHA_TABS_CTD1.pdf',
      },
    ]);
  });

  it('ignores links that are not PPB upload PDFs', () => {
    expect(
      parseSmpcIndex(
        '<table><tr><td>1</td><td>x</td><td><a href="https://evil.example/x.pdf">x</a></td></tr></table>',
      ),
    ).toEqual([]);
  });
});

describe('matchSmpcLinks', () => {
  it('links a trade-name title with high confidence', () => {
    expect(linksFor('PANADOL ADVANCE')).toEqual(['paracetamol:high']);
  });

  it('links a generic INN title with medium confidence', () => {
    expect(linksFor('PARACETAMOL TABLETS BP 500MG')).toEqual(['paracetamol:medium']);
  });

  it('never links brand line extensions or combinations to a single-ingredient drug', () => {
    expect(linksFor('PANADOL COLD & FLU')).toEqual([]);
    expect(linksFor('Panadol Extra Soluble')).toEqual([]);
  });

  it('links a combination title to the combination drug only', () => {
    expect(
      linksFor('CLAVACE DRY SYRUP Amoxicillin & Clavulanate Potassium for Oral Suspension'),
    ).toEqual(['co-amoxiclav:medium']);
    expect(linksFor('Artemether 20 mg and Lumefantrine 120 mg Tablets')).toEqual([
      'artemether-lumefantrine:medium',
    ]);
    expect(linksFor('COARTEM BABY DISPERSIBLE TABLETS')).toEqual(['artemether-lumefantrine:high']);
  });

  it('skips a title whose route the drug never uses', () => {
    expect(linksFor('Moxifloxacin ophthalmic solution 0.5% eye drops')).toEqual([]);
    expect(linksFor('Moxifloxacin 400mg Tablets')).toEqual(['moxifloxacin:medium']);
  });
});

describe('parseRegisterPage', () => {
  const html = `<table class="xcrud-list table">
    <thead><tr class="xcrud-th"><th class="xcrud-num">&#35;</th>
      <th>Product Trade Name</th><th>Product Registration No</th><th>Inn Of Api</th>
      <th>Dosage Form Name</th><th>Country of Origin</th><th>Local Foreign</th>
      <th>Mah Company Name</th><th>Local Technical Representative</th>
      <th class="xcrud-current xcrud-desc">&darr; Date of Registration</th><th>Date of Expiry</th></tr></thead>
    <tbody><tr class="xcrud-row"><td>1</td><td>ALPHA 5MG TABLETS</td><td>H0000/00001/R1</td>
      <td>Examplamide</td><td>Tablet</td><td>Kenya</td><td>Local</td><td>Example Pharma Ltd</td>
      <td>Example Distributors</td><td>2026 September 02</td><td>2031 September 02</td></tr></tbody></table>`;

  it('maps columns by header text (order-independent) and normalises dates', () => {
    expect(parseRegisterPage(html)).toEqual([
      {
        registrationNo: 'H0000/00001/R1',
        tradeName: 'ALPHA 5MG TABLETS',
        inn: 'Examplamide',
        dosageForm: 'Tablet',
        countryOfOrigin: 'Kenya',
        localForeign: 'Local',
        mah: 'Example Pharma Ltd',
        localTechnicalRepresentative: 'Example Distributors',
        registrationDate: '2026-09-02',
        expiryDate: '2031-09-02',
      },
    ]);
  });

  it('returns nothing when the expected table is absent', () => {
    expect(parseRegisterPage('<html>Restricted</html>')).toEqual([]);
  });

  it('ppbDate leaves unparseable values untouched', () => {
    expect(ppbDate('2026 Smarch 02')).toBe('2026 Smarch 02');
  });
});
