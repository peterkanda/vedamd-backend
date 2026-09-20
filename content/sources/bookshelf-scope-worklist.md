# NCBI Bookshelf scope worklist

`ncbi.nlm.nih.gov` serves three works under three different licences:
StatPearls (CC BY-NC-ND, cite-only), **LactMed** and **LiverTox** (both US
government works, public domain). Matching a citation to a source by host
alone therefore filed every LactMed and LiverTox citation under StatPearls'
cite-only verdict, blocking content we are free to embed.

`pathPrefixes` in `registry.json` now scopes each work to explicit page
ids. Bookshelf ids do not encode which work a page belongs to and the
ranges interleave (StatPearls NBK545153 sits between LiverTox NBK548327 and
LactMed NBK501259), so a numeric pattern is not safe.

## What needs doing

Open each id and confirm it belongs to the work claimed. When a list is
fully confirmed, flip that source's `embeddable` from `verify` to `yes`.
Anything that turns out to be StatPearls or another work: remove the id
from `pathPrefixes` and correct the citation's label in the bundle.

## LactMed — 44 page(s), 170 citation(s)

| NBK id | citations | label as cited | first seen in |
|---|---|---|---|
| [NBK500573](https://www.ncbi.nlm.nih.gov/books/NBK500573/) | 1 | LactMed: Itraconazole. https://www.ncbi.nlm.nih.gov/books/NBK500573/ | `pregnancy-lactation.json` |
| [NBK500576](https://www.ncbi.nlm.nih.gov/books/NBK500576/) | 1 | LactMed: Daptomycin. https://www.ncbi.nlm.nih.gov/books/NBK500576/ | `pregnancy-lactation.json` |
| [NBK500582](https://www.ncbi.nlm.nih.gov/books/NBK500582/) | 1 | LactMed: Enalapril. https://www.ncbi.nlm.nih.gov/books/NBK500582/ | `pregnancy-lactation.json` |
| [NBK500586](https://www.ncbi.nlm.nih.gov/books/NBK500586/) | 1 | LactMed: Cefixime. https://www.ncbi.nlm.nih.gov/books/NBK500586/ | `pregnancy-lactation.json` |
| [NBK500587](https://www.ncbi.nlm.nih.gov/books/NBK500587/) | 2 | LactMed: Ampicillin. https://www.ncbi.nlm.nih.gov/books/NBK500587/ | `pregnancy-lactation.json` |
| [NBK500709](https://www.ncbi.nlm.nih.gov/books/NBK500709/) | 1 | LactMed: Acyclovir. https://www.ncbi.nlm.nih.gov/books/NBK500709/ | `pregnancy-lactation.json` |
| [NBK500980](https://www.ncbi.nlm.nih.gov/books/NBK500980/) | 1 | LactMed: Acetaminophen. https://www.ncbi.nlm.nih.gov/books/NBK500980/ | `pregnancy-lactation.json` |
| [NBK500986](https://www.ncbi.nlm.nih.gov/books/NBK500986/) | 1 | LactMed: Ibuprofen. https://www.ncbi.nlm.nih.gov/books/NBK500986/ | `pregnancy-lactation.json` |
| [NBK500991](https://www.ncbi.nlm.nih.gov/books/NBK500991/) | 4 | LactMed: Insulin. https://www.ncbi.nlm.nih.gov/books/NBK500991/ | `pregnancy-lactation.json` |
| [NBK501105](https://www.ncbi.nlm.nih.gov/books/NBK501105/) | 1 | LactMed: Beclomethasone. https://www.ncbi.nlm.nih.gov/books/NBK501105/ | `pregnancy-lactation.json` |
| [NBK501212](https://www.ncbi.nlm.nih.gov/books/NBK501212/) | 1 | LactMed: Verapamil. https://www.ncbi.nlm.nih.gov/books/NBK501212/ | `pregnancy-lactation.json` |
| [NBK501214](https://www.ncbi.nlm.nih.gov/books/NBK501214/) | 1 | LactMed: Diltiazem. https://www.ncbi.nlm.nih.gov/books/NBK501214/ | `pregnancy-lactation.json` |
| [NBK501215](https://www.ncbi.nlm.nih.gov/books/NBK501215/) | 1 | LactMed: Budesonide. https://www.ncbi.nlm.nih.gov/books/NBK501215/ | `pregnancy-lactation.json` |
| [NBK501229](https://www.ncbi.nlm.nih.gov/books/NBK501229/) | 2 | LactMed: Penicillin G (Benzylpenicillin). https://www.ncbi.nlm.nih.gov/books/NBK501229/ | `pregnancy-lactation.json` |
| [NBK501230](https://www.ncbi.nlm.nih.gov/books/NBK501230/) | 2 | LactMed: Penicillin V (Phenoxymethylpenicillin). https://www.ncbi.nlm.nih.gov/books/NBK501230/ | `pregnancy-lactation.json` |
| [NBK501259](https://www.ncbi.nlm.nih.gov/books/NBK501259/) | 1 | LactMed: Amoxicillin; Clavulanic acid. https://www.ncbi.nlm.nih.gov/books/NBK501259/ | `pregnancy-lactation.json` |
| [NBK501291](https://www.ncbi.nlm.nih.gov/books/NBK501291/) | 1 | LactMed: Levofloxacin. https://www.ncbi.nlm.nih.gov/books/NBK501291/ | `pregnancy-lactation.json` |
| [NBK501318](https://www.ncbi.nlm.nih.gov/books/NBK501318/) | 1 | LactMed: Zanamivir. https://www.ncbi.nlm.nih.gov/books/NBK501318/ | `pregnancy-lactation.json` |
| [NBK501341](https://www.ncbi.nlm.nih.gov/books/NBK501341/) | 1 | LactMed: Cefazolin. https://www.ncbi.nlm.nih.gov/books/NBK501341/ | `pregnancy-lactation.json` |
| [NBK501344](https://www.ncbi.nlm.nih.gov/books/NBK501344/) | 1 | LactMed: Cefepime. https://www.ncbi.nlm.nih.gov/books/NBK501344/ | `pregnancy-lactation.json` |
| [NBK501346](https://www.ncbi.nlm.nih.gov/books/NBK501346/) | 1 | LactMed: Ceftazidime. https://www.ncbi.nlm.nih.gov/books/NBK501346/ | `pregnancy-lactation.json` |
| [NBK501348](https://www.ncbi.nlm.nih.gov/books/NBK501348/) | 1 | LactMed: Cefotaxime. https://www.ncbi.nlm.nih.gov/books/NBK501348/ | `pregnancy-lactation.json` |
| [NBK501352](https://www.ncbi.nlm.nih.gov/books/NBK501352/) | 1 | LactMed: Ertapenem. https://www.ncbi.nlm.nih.gov/books/NBK501352/ | `pregnancy-lactation.json` |
| [NBK501356](https://www.ncbi.nlm.nih.gov/books/NBK501356/) | 1 | LactMed: Clotrimazole. https://www.ncbi.nlm.nih.gov/books/NBK501356/ | `pregnancy-lactation.json` |
| [NBK501371](https://www.ncbi.nlm.nih.gov/books/NBK501371/) | 1 | LactMed: Domperidone. https://www.ncbi.nlm.nih.gov/books/NBK501371/ | `pregnancy-lactation.json` |
| [NBK501374](https://www.ncbi.nlm.nih.gov/books/NBK501374/) | 2 | LactMed: Ganciclovir/Valganciclovir. https://www.ncbi.nlm.nih.gov/books/NBK501374/ | `pregnancy-lactation.json` |
| [NBK501377](https://www.ncbi.nlm.nih.gov/books/NBK501377/) | 1 | LactMed: Fosfomycin. https://www.ncbi.nlm.nih.gov/books/NBK501377/ | `pregnancy-lactation.json` |
| [NBK501404](https://www.ncbi.nlm.nih.gov/books/NBK501404/) | 1 | LactMed: Griseofulvin. https://www.ncbi.nlm.nih.gov/books/NBK501404/ | `pregnancy-lactation.json` |
| [NBK501426](https://www.ncbi.nlm.nih.gov/books/NBK501426/) | 1 | LactMed: Ketoconazole. https://www.ncbi.nlm.nih.gov/books/NBK501426/ | `pregnancy-lactation.json` |
| [NBK501445](https://www.ncbi.nlm.nih.gov/books/NBK501445/) | 1 | LactMed: Miconazole. https://www.ncbi.nlm.nih.gov/books/NBK501445/ | `pregnancy-lactation.json` |
| [NBK501447](https://www.ncbi.nlm.nih.gov/books/NBK501447/) | 1 | LactMed: Minocycline. https://www.ncbi.nlm.nih.gov/books/NBK501447/ | `pregnancy-lactation.json` |
| [NBK501458](https://www.ncbi.nlm.nih.gov/books/NBK501458/) | 1 | LactMed: Moxifloxacin. https://www.ncbi.nlm.nih.gov/books/NBK501458/ | `pregnancy-lactation.json` |
| [NBK501478](https://www.ncbi.nlm.nih.gov/books/NBK501478/) | 1 | LactMed: Atovaquone and Proguanil. https://www.ncbi.nlm.nih.gov/books/NBK501478/ | `pregnancy-lactation.json` |
| [NBK501535](https://www.ncbi.nlm.nih.gov/books/NBK501535/) | 1 | LactMed: Nevirapine. https://www.ncbi.nlm.nih.gov/books/NBK501535/ | `pregnancy-lactation.json` |
| [NBK501536](https://www.ncbi.nlm.nih.gov/books/NBK501536/) | 1 | LactMed: Dolutegravir; Lamivudine. https://www.ncbi.nlm.nih.gov/books/NBK501536/ | `pregnancy-lactation.json` |
| [NBK501538](https://www.ncbi.nlm.nih.gov/books/NBK501538/) | 1 | LactMed: Lopinavir; Ritonavir. https://www.ncbi.nlm.nih.gov/books/NBK501538/ | `pregnancy-lactation.json` |
| [NBK501548](https://www.ncbi.nlm.nih.gov/books/NBK501548/) | 1 | LactMed: Emtricitabine. https://www.ncbi.nlm.nih.gov/books/NBK501548/ | `pregnancy-lactation.json` |
| [NBK501549](https://www.ncbi.nlm.nih.gov/books/NBK501549/) | 1 | LactMed: Tenofovir. https://www.ncbi.nlm.nih.gov/books/NBK501549/ | `pregnancy-lactation.json` |
| [NBK501744](https://www.ncbi.nlm.nih.gov/books/NBK501744/) | 1 | LactMed: Entecavir. https://www.ncbi.nlm.nih.gov/books/NBK501744/ | `pregnancy-lactation.json` |
| [NBK501885](https://www.ncbi.nlm.nih.gov/books/NBK501885/) | 1 | LactMed: Diphenhydramine. https://www.ncbi.nlm.nih.gov/books/NBK501885/ | `pregnancy-lactation.json` |
| [NBK501922](https://www.ncbi.nlm.nih.gov/books/NBK501922/) | 120 | LactMed: Ritonavir. https://www.ncbi.nlm.nih.gov/books/NBK501922/ | `pregnancy-lactation.json` |
| [NBK567883](https://www.ncbi.nlm.nih.gov/books/NBK567883/) | 1 | LactMed: Granisetron. https://www.ncbi.nlm.nih.gov/books/NBK567883/ | `pregnancy-lactation.json` |
| [NBK582797](https://www.ncbi.nlm.nih.gov/books/NBK582797/) | 1 | MotherToBaby/LactMed: Lithium. https://www.ncbi.nlm.nih.gov/books/NBK582797/ | `pregnancy-lactation.json` |
| [NBK621367](https://www.ncbi.nlm.nih.gov/books/NBK621367/) | 1 | LactMed: Tenofovir Alafenamide. https://www.ncbi.nlm.nih.gov/books/NBK621367/ | `pregnancy-lactation.json` |

## LiverTox — 2 page(s), 2 citation(s)

| NBK id | citations | label as cited | first seen in |
|---|---|---|---|
| [NBK548327](https://www.ncbi.nlm.nih.gov/books/NBK548327/) | 1 | Pioglitazone. LiverTox: Clinical and Research Information on Drug-Induced Liver Injury. National Institute of Diabetes and Digestive and Kidney Diseases; NBK548327. | `hepatic-dose.json` |
| [NBK548791](https://www.ncbi.nlm.nih.gov/books/NBK548791/) | 1 | Montelukast. LiverTox: Clinical and Research Information on Drug-Induced Liver Injury. National Institute of Diabetes and Digestive and Kidney Diseases. | `hepatic-dose.json` |

