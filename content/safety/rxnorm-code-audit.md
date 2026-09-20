# RxNorm code audit — drugs.json (v0.1.0)

Generated 2026-09-18T22:18:55.309Z by `npm run audit:drug-rxnorm` against
RxNav (US NLM). Read-only worklist: **no bundle content was changed.**

`DrugCodeIndex` (src/modules/cds/normalize/code-resolver.ts) maps an EHR's
RxNorm coding directly to a VedaMD drug using these codes, so a wrong code
makes CDS evaluate the wrong medicine. Corrections need clinical-content
review and a re-signed bundle.

| verdict | count | meaning |
|---|---|---|
| ok | 187 | code's ingredient(s) = INN's ingredient(s) |
| wrong-ingredient | 69 | code belongs to a different molecule — **fix first** |
| partial-combination | 4 | combination drug coded as one of its components |
| different-concept | 0 | overlapping but unequal ingredient sets |
| code-not-found | 152 | RxNav has no concept for the code |
| name-mismatch | 4 | INN not resolvable, and none of the code's ingredients is named in it — another product |
| inn-unresolved | 0 | INN not resolvable in RxNorm (vaccines, classes) — code not verifiable here |

Suggested codes are ingredient-level (IN) or multi-ingredient (MIN) concepts
derived from the INN. Confirm each against the record's intended product
before applying.

## Wrong ingredient (69)

| slug | INN | KEML | current code → RxNorm concept | INN resolves to | suggested code |
|---|---|---|---|---|---|
| alendronate | Alendronate | 2 | 595 → algestone (IN) | alendronate (46041) | 46041 (alendronate, IN) |
| amantadine | Amantadine | 2 | 725 → amphetamine (IN) | amantadine (620) | 620 (amantadine, IN) |
| amphotericin-b | amphotericin B (liposomal preferred) | 3 | 703 → amiodarone (IN) | amphotericin B (732) | 732 (amphotericin B, IN) |
| artemether-lumefantrine | artemether + lumefantrine | 1 | 847232 → 3 ML insulin glargine 100 UNT/ML Pen Injector [Lantus] (SBD) | artemether (18343) + lumefantrine (847728) | 282448 (artemether / lumefantrine, MIN) |
| bedaquiline | Bedaquiline | 4 | 1311327 → Sus scrofa embryo preparation (IN) | bedaquiline (1364504) | 1364504 (bedaquiline, IN) |
| cabergoline | Cabergoline | 3 | 20610 → cetirizine (IN) | cabergoline (47579) | 47579 (cabergoline, IN) |
| caspofungin | Caspofungin | 4 | 352387 → lovastatin / niacin (MIN) | caspofungin (140108) | 140108 (caspofungin, IN) |
| cefazolin | Cefazolin | 2 | 2191 → ceftazidime (IN) | cefazolin (2180) | 2180 (cefazolin, IN) |
| cefixime | Cefixime | 3 | 2191 → ceftazidime (IN) | cefixime (25033) | 25033 (cefixime, IN) |
| cefotaxime | cefotaxime | 2 | 2191 → ceftazidime (IN) | cefotaxime (2186) | 2186 (cefotaxime, IN) |
| cefuroxime | Cefuroxime | 2 | 2231 → cephalexin (IN) | cefuroxime (2194) | 2194 (cefuroxime, IN) |
| chloramphenicol-eye-drops | chloramphenicol 0.5 % eye drops | 1 | 2418 → cholecalciferol (IN) | chloramphenicol (2348) | 2348 (chloramphenicol, IN) |
| chlorhexidine-topical | Chlorhexidine (digluconate) | 1 | 2353 → clorazepate (IN) | chlorhexidine (2358) | 2358 (chlorhexidine, IN) |
| cholecalciferol | Cholecalciferol (vitamin D3) | 1 | 11253 → vitamin D (IN) | cholecalciferol (2418) | 2418 (cholecalciferol, IN) |
| combined-oral-contraceptive | ethinylestradiol + levonorgestrel (combined oral contraceptive) | 1 | 748962 → {28 (norethindrone 0.35 MG Oral Tablet) } Pack [Camila 28 Day] (BPCK) | ethinyl estradiol (4124) + levonorgestrel (6373) | 214558 (ethinyl estradiol / levonorgestrel, MIN) |
| cycloserine | Cycloserine | 4 | 3000 → cyclopenthiazide (IN) | cycloserine (3007) | 3007 (cycloserine, IN) |
| dapsone | dapsone | 2 | 3008 → cyclosporine (IN) | dapsone (3108) | 3108 (dapsone, IN) |
| desferrioxamine | Desferrioxamine (deferoxamine) | 4 | 3290 → dextromoramide (IN) | deferoxamine (3131) | 3131 (deferoxamine, IN) |
| doravirine | Doravirine | 3 | 2059015 → rivaroxaban 2.5 MG Oral Tablet (SCD) | doravirine (2055755) | 2055755 (doravirine, IN) |
| doxazosin | doxazosin | 2 | 3356 → dicloxacillin (IN) | doxazosin (49276) | 49276 (doxazosin, IN) |
| ergometrine | Ergometrine (ergonovine) | 1 | 4024 → ergoloid mesylates, USP (IN) | ergonovine (4021) | 4021 (ergonovine, IN) |
| esmolol | Esmolol | 3 | 4053 → erythromycin (IN) | esmolol (49737) | 49737 (esmolol, IN) |
| etonogestrel-implant | Etonogestrel subdermal implant | 2 | 1100070 → famotidine 26.6 MG / ibuprofen 800 MG Oral Tablet [Duexis] (SBD) | etonogestrel (14584) | 14584 (etonogestrel, IN) |
| fentanyl-patch | Fentanyl transdermal patch | 2 | 1014615 → acetaminophen 300 MG / oxycodone hydrochloride 5 MG Oral Tablet (SCD) | fentanyl (4337) | 4337 (fentanyl, IN) |
| ferrous-sulphate | ferrous sulphate | 1 | 4452 → fludrocortisone (IN) | ferrous sulfate (24947) | 24947 (ferrous sulfate, IN) |
| flecainide | Flecainide | 3 | 4495 → flupenthixol (IN) | flecainide (4441) | 4441 (flecainide, IN) |
| gliclazide | Gliclazide | 1 | 25789 → glimepiride (IN) | gliclazide (4816) | 4816 (gliclazide, IN) |
| hydroxocobalamin | Hydroxocobalamin | 3 | 5933 → iodine (IN) | hydroxocobalamin (5514) | 5514 (hydroxocobalamin, IN) |
| hydroxyzine | Hydroxyzine | 1 | 5552 → hydroxyurea (IN) | hydroxyzine (5553) | 5553 (hydroxyzine, IN) |
| infliximab | Infliximab | 4 | 253337 → bevacizumab (IN) | infliximab (191831) | 191831 (infliximab, IN) |
| insulin-degludec | Insulin degludec | 3 | 1652640 → 3 ML insulin lispro 100 UNT/ML Pen Injector [Humalog] (SBD) | insulin degludec (1670007) | 1670007 (insulin degludec, IN) |
| ipratropium-nebulised | ipratropium bromide (nebulised) | 1 | 8163 → phenylephrine (IN) | ipratropium (7213) | 7213 (ipratropium, IN) |
| isosorbide-mononitrate | isosorbide-5-mononitrate | 2 | 6086 → juniper tar (IN) | isosorbide (6057) | 6057 (isosorbide, IN) |
| ivermectin | ivermectin | 1 | 30121 → moclobemide (IN) | ivermectin (6069) | 6069 (ivermectin, IN) |
| latanoprost | Latanoprost (ophthalmic) | 1 | 1364430 → apixaban (IN) | latanoprost (43611) | 43611 (latanoprost, IN) |
| leuprorelin | Leuprorelin | 3 | 6531 → lypressin (IN) | leuprolide (42375) | 42375 (leuprolide, IN) |
| linezolid | linezolid | 3 | 284635 → fluticasone / salmeterol (MIN) | linezolid (190376) | 190376 (linezolid, IN) |
| lithium | lithium carbonate | 2 | 6448 → lithium (IN) | lithium carbonate (42351) | 42351 (lithium carbonate, IN) |
| lopinavir-ritonavir | Lopinavir/ritonavir | 2 | 597722 → ribavirin 600 MG Oral Tablet (SCD) | lopinavir (195088) + ritonavir (85762) | 284640 (lopinavir / ritonavir, MIN) |
| magnesium-sulphate | magnesium sulphate | 1 | 6582 → magnesium oxide (IN) | magnesium sulfate (6585) | 6585 (magnesium sulfate, IN) |
| mebendazole | Mebendazole | 1 | 6711 → melatonin (IN) | mebendazole (6672) | 6672 (mebendazole, IN) |
| medroxyprogesterone-depot | medroxyprogesterone acetate (depot, DMPA) | 1 | 6845 → methocarbamol (IN) | medroxyprogesterone (6691) | 6691 (medroxyprogesterone, IN) |
| mesalazine | mesalazine (5-aminosalicylic acid) | 2 | 703 → amiodarone (IN) | mesalamine (52582) | 52582 (mesalamine, IN) |
| mifepristone | mifepristone | 2 | 6915 → metoclopramide (IN) | mifepristone (6964) | 6964 (mifepristone, IN) |
| misoprostol | misoprostol | 1 | 44 → mesna (IN) | misoprostol (42331) | 42331 (misoprostol, IN) |
| n-acetylcysteine | N-acetylcysteine (acetylcysteine) | 2 | 199 → acetyldigoxins (IN) | acetylcysteine (197) | 197 (acetylcysteine, IN) |
| nevirapine | nevirapine | 2 | 7393 → niacin (IN) | nevirapine (53654) | 53654 (nevirapine, IN) |
| niclosamide | Niclosamide | 2 | 7421 → nifurtimox (IN) | niclosamide (7402) | 7402 (niclosamide, IN) |
| nicorandil | Nicorandil | 3 | 725 → amphetamine (IN) | nicorandil (31748) | 31748 (nicorandil, IN) |
| nicotinamide | Nicotinamide (niacinamide) | 1 | 7393 → niacin (IN) | niacinamide (7405) | 7405 (niacinamide, IN) |
| nintedanib | Nintedanib | 4 | 1594659 → Lemtrada (BN) | nintedanib (1592737) | 1592737 (nintedanib, IN) |
| nitrous-oxide | Nitrous oxide (50 % with O₂ — Entonox) | 2 | 7440 → nitrazepam (IN) | nitrous oxide (7486) | 7486 (nitrous oxide, IN) |
| omalizumab | Omalizumab | 4 | 284679 → Campath (BN) | omalizumab (302379) | 302379 (omalizumab, IN) |
| permethrin-topical | permethrin (topical 5 % cream) | 1 | 8156 → phenylalanine (IN) | permethrin (33199) | 33199 (permethrin, IN) |
| piperacillin-tazobactam | piperacillin + tazobactam | 2 | 73494 → telmisartan (IN) | piperacillin (8339) + tazobactam (37617) | 74169 (piperacillin / tazobactam, MIN) |
| prednisolone | prednisolone | 1 | 8640 → prednisone (IN) | prednisolone (8638) | 8638 (prednisolone, IN) |
| primaquine | primaquine | 2 | 8783 → propolis (IN) | primaquine (8687) | 8687 (primaquine, IN) |
| proxymetacaine | Proxymetacaine (proparacaine, ophthalmic) | 2 | 8814 → epoprostenol (IN) | proparacaine (34905) | 34905 (proparacaine, IN) |
| rocuronium | rocuronium | 3 | 9518 → salicylamide (IN) | rocuronium (68139) | 68139 (rocuronium, IN) |
| sevoflurane | Sevoflurane | 3 | 36117 → salmeterol (IN) | sevoflurane (36453) | 36453 (sevoflurane, IN) |
| sofosbuvir-velpatasvir | Sofosbuvir/velpatasvir | 3 | 1734918 → cyclophosphamide 1000 MG (SCDC) | sofosbuvir (1484911) + velpatasvir (1799206) | 1799211 (sofosbuvir / velpatasvir, MIN) |
| spiramycin | Spiramycin | 3 | 9876 → gold sodium thiosulfate (PIN) | spiramycin (9991) | 9991 (spiramycin, IN) |
| tamsulosin | tamsulosin | 2 | 37798 → terazosin (IN) | tamsulosin (77492) | 77492 (tamsulosin, IN) |
| terbinafine | terbinafine | 2 | 10485 → thioguanine (IN) | terbinafine (37801) | 37801 (terbinafine, IN) |
| tocilizumab | Tocilizumab | 4 | 1009345 → oxibendazole 0.227 MG/MG Oral Paste (SCD) | tocilizumab (612865) | 612865 (tocilizumab, IN) |
| tranexamic-acid | tranexamic acid | 1 | 37798 → terazosin (IN) | tranexamic acid (10691) | 10691 (tranexamic acid, IN) |
| valproate | Sodium valproate | 2 | 39998 → zonisamide (IN) | valproate (40254) | 40254 (valproate, IN) |
| vitamin-k | phytomenadione (vitamin K1) | 1 | 11258 → vitamin K (IN) | vitamin K1 (8308) | 8308 (vitamin K1, IN) |
| voriconazole | voriconazole | 3 | 274786 → telithromycin (IN) | voriconazole (121243) | 121243 (voriconazole, IN) |

## Partial combination / different concept (4)

| slug | INN | KEML | current code → RxNorm concept | INN resolves to | suggested code |
|---|---|---|---|---|---|
| amoxicillin-clavulanate | amoxicillin + clavulanic acid | 2 | 723 → amoxicillin (IN) | amoxicillin (723) + clavulanate (48203) | 19711 (amoxicillin / clavulanate, MIN) |
| cotrimoxazole | sulfamethoxazole + trimethoprim | 1 | 10180 → sulfamethoxazole (IN) | sulfamethoxazole (10180) + trimethoprim (10829) | 10831 (sulfamethoxazole / trimethoprim, MIN) |
| nirmatrelvir-ritonavir | Nirmatrelvir/ritonavir | 4 | 2587892 → nirmatrelvir (IN) | nirmatrelvir (2587892) + ritonavir (85762) | — (no MIN for nirmatrelvir / ritonavir) |
| sacubitril-valsartan | sacubitril + valsartan (ARNI) | 2 | 1656328 → sacubitril (IN) | sacubitril (1656328) + valsartan (69749) | 1656339 (sacubitril / valsartan, MIN) |

## Name mismatch (4)

| slug | INN | KEML | current code → RxNorm concept | INN resolves to | suggested code |
|---|---|---|---|---|---|
| hepatitis-a-vaccine | Hepatitis A vaccine (inactivated) | 2 | 73178 → iloperidone (IN) | — | — |
| ors | oral rehydration salts (WHO low-osmolarity) | 1 | 8163 → phenylephrine (IN) | — | — |
| rabies-vaccine | Rabies vaccine (purified Vero / chick embryo cell) | 1 | 8674 → prenylamine (IN) | — | — |
| ringer-lactate | Ringer's lactate (Hartmann's solution) | 1 | 1807630 → 25 ML sodium chloride 9 MG/ML Injection (SCD) | — | — |

## Code not found (152)

| slug | INN | KEML | current code → RxNorm concept | INN resolves to | suggested code |
|---|---|---|---|---|---|
| acamprosate | Acamprosate | 3 | 62731 → — (—) | acamprosate (82819) | 82819 (acamprosate, IN) |
| acetazolamide | Acetazolamide | 2 | 60 → — (—) | acetazolamide (167) | 167 (acetazolamide, IN) |
| activated-charcoal | Activated charcoal | 1 | 2103 → — (—) | activated charcoal (272) | 272 (activated charcoal, IN) |
| adenosine | Adenosine | 2 | 203 → — (—) | adenosine (296) | 296 (adenosine, IN) |
| albendazole | albendazole | 1 | 584 → — (—) | albendazole (430) | 430 (albendazole, IN) |
| anti-d-immunoglobulin | Anti-D immunoglobulin (Rho(D)) | 2 | 33550 → — (—) | Rho(D) immune globulin (35465) | 35465 (Rho(D) immune globulin, IN) |
| apraclonidine | Apraclonidine (ophthalmic) | 3 | 788 → — (—) | apraclonidine (14845) | 14845 (apraclonidine, IN) |
| aprepitant | Aprepitant | 4 | 337244 → — (—) | aprepitant (358255) | 358255 (aprepitant, IN) |
| aripiprazole | Aripiprazole | 3 | 352271 → — (—) | aripiprazole (89013) | 89013 (aripiprazole, IN) |
| artesunate-iv | artesunate (parenteral) | 1 | 316680 → — (—) | artesunate (18346) | 18346 (artesunate, IN) |
| atazanavir-ritonavir | Atazanavir/ritonavir | 3 | 352167 → — (—) | atazanavir (343047) + ritonavir (85762) | — (no MIN for atazanavir / ritonavir) |
| atomoxetine | Atomoxetine | 3 | 342731 → — (—) | atomoxetine (38400) | 38400 (atomoxetine, IN) |
| atovaquone | Atovaquone | 3 | 1233 → — (—) | atovaquone (60212) | 60212 (atovaquone, IN) |
| atovaquone-proguanil | Atovaquone/proguanil | 3 | 636411 → — (—) | atovaquone (60212) + proguanil (2382) | 284623 (atovaquone / proguanil, MIN) |
| baclofen | Baclofen | 2 | 1245 → — (—) | baclofen (1292) | 1292 (baclofen, IN) |
| benzathine-penicillin | benzathine benzylpenicillin | 1 | 1659587 → — (—) | penicillin G (7980) | 7980 (penicillin G, IN) |
| buprenorphine-naloxone | Buprenorphine/naloxone | 2 | 354227 → — (—) | buprenorphine (1819) + naloxone (7242) | 352364 (buprenorphine / naloxone, MIN) |
| cabotegravir-rilpivirine-injectable | Cabotegravir + rilpivirine (long-acting injectable) | 4 | 2399215 → — (—) | cabotegravir (2475077) + rilpivirine (1102270) | — (no MIN for cabotegravir / rilpivirine) |
| calcitonin-salmon | Calcitonin (salmon) | 4 | 1922 → — (—) | calcitonin (1311287) | 1311287 (calcitonin, IN) |
| calcitriol | Calcitriol (1,25-dihydroxyvitamin D3) | 4 | 2098 → — (—) | calcitriol (1894) | 1894 (calcitriol, IN) |
| calcium-gluconate | calcium gluconate | 1 | 1898 → — (—) | calcium gluconate (1908) | 1908 (calcium gluconate, IN) |
| carbetocin | Carbetocin | 2 | 2376767 → — (—) | — | — |
| carbimazole | Carbimazole | 2 | 2208 → — (—) | carbimazole (2020) | 2020 (carbimazole, IN) |
| carboprost | Carboprost (15-methyl PGF2α) | 2 | 1923 → — (—) | carboprost (2051) | 2051 (carboprost, IN) |
| cefepime | Cefepime | 3 | 2197 → — (—) | cefepime (20481) | 20481 (cefepime, IN) |
| ceftaroline | Ceftaroline fosamil | 4 | 1090090 → — (—) | ceftaroline fosamil (1040004) | 1040004 (ceftaroline fosamil, IN) |
| cinacalcet | Cinacalcet | 4 | 375128 → — (—) | cinacalcet (407990) | 407990 (cinacalcet, IN) |
| clofazimine | Clofazimine | 4 | 2566 → — (—) | clofazimine (2592) | 2592 (clofazimine, IN) |
| clotrimazole-topical | clotrimazole (topical 1 %) | 1 | 2645 → — (—) | clotrimazole (2623) | 2623 (clotrimazole, IN) |
| clozapine | Clozapine | 4 | 2624 → — (—) | clozapine (2626) | 2626 (clozapine, IN) |
| cyclizine | Cyclizine | 1 | 3045 → — (—) | cyclizine (2977) | 2977 (cyclizine, IN) |
| cyclopentolate | Cyclopentolate (ophthalmic) | 2 | 3197 → — (—) | cyclopentolate (3001) | 3001 (cyclopentolate, IN) |
| dantrolene | Dantrolene sodium | 3 | 3157 → — (—) | dantrolene (3105) | 3105 (dantrolene, IN) |
| daptomycin | Daptomycin | 4 | 350178 → — (—) | daptomycin (22299) | 22299 (daptomycin, IN) |
| delamanid | Delamanid | 4 | 1422022 → — (—) | — | — |
| denosumab | Denosumab | 4 | 993481 → — (—) | denosumab (993449) | 993449 (denosumab, IN) |
| desmopressin | desmopressin (DDAVP) | 2 | 3273 → — (—) | desmopressin (3251) | 3251 (desmopressin, IN) |
| dextrose-10 | glucose 10 % (dextrose 10 %) | 1 | 4851 → — (—) | glucose (4850) | 4850 (glucose, IN) |
| diethylcarbamazine | Diethylcarbamazine (DEC) | 2 | 3284 → — (—) | diethylcarbamazine (3384) | 3384 (diethylcarbamazine, IN) |
| digoxin-immune-fab | Digoxin-specific antibody fragments (Fab) | 4 | 203041 → — (—) | digoxin antibodies Fab fragments (203223) | 203223 (digoxin antibodies Fab fragments, IN) |
| diloxanide-furoate | Diloxanide furoate | 3 | 3406 → — (—) | diloxanide (67182) | 67182 (diloxanide, IN) |
| diphtheria-antitoxin | Diphtheria antitoxin (equine) | 1 | 3306 → — (—) | diphtheria antitoxin (3510) | 3510 (diphtheria antitoxin, IN) |
| disulfiram | Disulfiram | 2 | 3504 → — (—) | disulfiram (3554) | 3554 (disulfiram, IN) |
| dolutegravir | dolutegravir | 2 | 1487549 → — (—) | dolutegravir (1433868) | 1433868 (dolutegravir, IN) |
| domperidone | Domperidone | 2 | 3568 → — (—) | domperidone (3626) | 3626 (domperidone, IN) |
| doxylamine-pyridoxine | Doxylamine/pyridoxine | 1 | 1422089 → — (—) | doxylamine (3642) + pyridoxine (684879) | 1375947 (doxylamine / pyridoxine, MIN) |
| dupilumab | Dupilumab | 4 | 1922144 → — (—) | dupilumab (1876376) | 1876376 (dupilumab, IN) |
| dutasteride | Dutasteride | 3 | 315098 → — (—) | dutasteride (228790) | 228790 (dutasteride, IN) |
| emtricitabine | Emtricitabine | 2 | 351368 → — (—) | emtricitabine (276237) | 276237 (emtricitabine, IN) |
| entecavir | Entecavir | 3 | 428611 → — (—) | entecavir (306266) | 306266 (entecavir, IN) |
| ephedrine | Ephedrine | 3 | 4014 → — (—) | ephedrine (3966) | 3966 (ephedrine, IN) |
| ertapenem | Ertapenem | 4 | 351143 → — (—) | ertapenem (325642) | 325642 (ertapenem, IN) |
| ethambutol | ethambutol | 2 | 4150 → — (—) | ethambutol (4110) | 4110 (ethambutol, IN) |
| etomidate | etomidate | 3 | 4116 → — (—) | etomidate (4177) | 4177 (etomidate, IN) |
| evolocumab | Evolocumab | 4 | 1657052 → — (—) | evolocumab (1665684) | 1665684 (evolocumab, IN) |
| fenofibrate | Fenofibrate | 2 | 4308 → — (—) | fenofibrate (8703) | 8703 (fenofibrate, IN) |
| ferric-carboxymaltose | ferric carboxymaltose (intravenous iron) | 2 | 1308276 → — (—) | ferric carboxymaltose (1433693) | 1433693 (ferric carboxymaltose, IN) |
| filgrastim | Filgrastim (recombinant G-CSF) | 3 | 65085 → — (—) | filgrastim (68442) | 68442 (filgrastim, IN) |
| flucloxacillin | flucloxacillin | 1 | 4527 → — (—) | floxacillin (4448) | 4448 (floxacillin, IN) |
| flucytosine | Flucytosine | 4 | 4514 → — (—) | flucytosine (4451) | 4451 (flucytosine, IN) |
| flumazenil | Flumazenil | 2 | 4490 → — (—) | flumazenil (4457) | 4457 (flumazenil, IN) |
| fomepizole | Fomepizole | 4 | 114212 → — (—) | fomepizole (15226) | 15226 (fomepizole, IN) |
| fusidic-acid-topical | fusidic acid (topical 2 %) | 2 | 4715 → — (—) | fusidate (113608) | 113608 (fusidate, IN) |
| ganciclovir-iv | Ganciclovir (intravenous) | 4 | 4865 → — (—) | ganciclovir (4678) | 4678 (ganciclovir, IN) |
| gentamicin | gentamicin | 2 | 4849 → — (—) | gentamicin (1596450) | 1596450 (gentamicin, IN) |
| hepatitis-b-vaccine | Hepatitis B vaccine (recombinant HBsAg) | 1 | 5359 → — (—) | hepatitis B surface antigen vaccine (797752) | 797752 (hepatitis B surface antigen vaccine, IN) |
| hydroxyurea | hydroxycarbamide (hydroxyurea) | 1 | 5454 → — (—) | hydroxyurea (5552) | 5552 (hydroxyurea, IN) |
| hyoscine-butylbromide | Hyoscine butylbromide | 1 | 5454 → — (—) | butylscopolamine (1085787) | 1085787 (butylscopolamine, IN) |
| idarucizumab | Idarucizumab | 4 | 1716705 → — (—) | idarucizumab (1716191) | 1716191 (idarucizumab, IN) |
| influenza-vaccine | Influenza vaccine (inactivated) | 2 | 88487 → — (—) | — | — |
| insulin-aspart | insulin aspart | 2 | 302166 → — (—) | insulin aspart, human (51428) | 51428 (insulin aspart, human, IN) |
| intravenous-immunoglobulin | Human normal immunoglobulin (IVIG) | 3 | 857349 → — (—) | — | — |
| intravenous-lipid-emulsion | Intravenous lipid emulsion 20% | 4 | 252181 → — (—) | — | — |
| isotretinoin | Isotretinoin | 3 | 27506 → — (—) | isotretinoin (6064) | 6064 (isotretinoin, IN) |
| ivabradine | ivabradine | 2 | 353225 → — (—) | ivabradine (1649480) | 1649480 (ivabradine, IN) |
| lanreotide | Lanreotide | 4 | 237155 → — (—) | lanreotide (68092) | 68092 (lanreotide, IN) |
| levodopa-carbidopa | Levodopa/carbidopa (co-careldopa) | 2 | 203208 → — (—) | levodopa (6375) + carbidopa (2019) | 103990 (carbidopa / levodopa, MIN) |
| levonorgestrel-ius | Levonorgestrel intrauterine system | 2 | 1037015 → — (—) | levonorgestrel (6373) | 6373 (levonorgestrel, IN) |
| liposomal-amphotericin-b | Liposomal amphotericin B | 3 | 857119 → — (—) | amphotericin B (732) | 732 (amphotericin B, IN) |
| mannitol | mannitol | 2 | 6647 → — (—) | mannitol (6628) | 6628 (mannitol, IN) |
| mefenamic-acid | Mefenamic acid | 3 | 6925 → — (—) | mefenamate (257844) | 257844 (mefenamate, IN) |
| mefloquine | Mefloquine | 2 | 6695 → — (—) | mefloquine (6694) | 6694 (mefloquine, IN) |
| mepolizumab | Mepolizumab | 4 | 1745109 → — (—) | mepolizumab (1720597) | 1720597 (mepolizumab, IN) |
| mesna | mesna | 3 | 6952 → — (—) | mesna (44) | 44 (mesna, IN) |
| methylene-blue | Methylthioninium chloride (methylene blue) | 3 | 6815 → — (—) | methylene blue (6878) | 6878 (methylene blue, IN) |
| methylphenidate | Methylphenidate | 3 | 6810 → — (—) | methylphenidate (6901) | 6901 (methylphenidate, IN) |
| milrinone | Milrinone | 4 | 6917 → — (—) | milrinone (52769) | 52769 (milrinone, IN) |
| miltefosine | Miltefosine | 4 | 1535981 → — (—) | miltefosine (1494066) | 1494066 (miltefosine, IN) |
| minocycline | Minocycline | 3 | 6987 → — (—) | minocycline (6980) | 6980 (minocycline, IN) |
| mirabegron | Mirabegron | 3 | 1422089 → — (—) | mirabegron (1300786) | 1300786 (mirabegron, IN) |
| mmr-vaccine | Measles, mumps and rubella vaccine | 1 | 38398 → — (—) | — | — |
| mupirocin-topical | mupirocin 2 % (topical) | 2 | 7388 → — (—) | mupirocin (42372) | 42372 (mupirocin, IN) |
| mycophenolate-mofetil | Mycophenolate mofetil | 4 | 8835 → — (—) | mycophenolate mofetil (68149) | 68149 (mycophenolate mofetil, IN) |
| natamycin | Natamycin (topical ophthalmic) | 3 | 7401 → — (—) | natamycin (7268) | 7268 (natamycin, IN) |
| neostigmine | Neostigmine | 2 | 7305 → — (—) | neostigmine (7315) | 7315 (neostigmine, IN) |
| nifurtimox | Nifurtimox | 4 | 7445 → — (—) | nifurtimox (7421) | 7421 (nifurtimox, IN) |
| nimodipine | nimodipine | 3 | 7415 → — (—) | nimodipine (7426) | 7426 (nimodipine, IN) |
| nitazoxanide | Nitazoxanide | 2 | 115429 → — (—) | nitazoxanide (31819) | 31819 (nitazoxanide, IN) |
| noradrenaline-vasopressin-fixed-combo | esmolol | 3 | 4154 → — (—) | esmolol (49737) | 49737 (esmolol, IN) |
| nystatin | nystatin | 1 | 7691 → — (—) | nystatin (7597) | 7597 (nystatin, IN) |
| octreotide | octreotide | 3 | 7406 → — (—) | octreotide (7617) | 7617 (octreotide, IN) |
| oxytocin | oxytocin | 1 | 7905 → — (—) | oxytocin (7824) | 7824 (oxytocin, IN) |
| paliperidone-palmitate | Paliperidone palmitate (long-acting injectable) | 4 | 1146493 → — (—) | paliperidone (679314) | 679314 (paliperidone, IN) |
| paracetamol-iv | paracetamol (intravenous) | 2 | 1037664 → — (—) | acetaminophen (161) | 161 (acetaminophen, IN) |
| paromomycin | Paromomycin | 2 | 7889 → — (—) | paromomycin (7934) | 7934 (paromomycin, IN) |
| paromomycin-im | Paromomycin (IM) | 3 | 7929 → — (—) | paromomycin (7934) | 7934 (paromomycin, IN) |
| penicillin-v | phenoxymethylpenicillin (penicillin V) | 1 | 8112 → — (—) | penicillin V (7984) | 7984 (penicillin V, IN) |
| pentamidine | Pentamidine isetionate | 4 | 7965 → — (—) | pentamidine (7994) | 7994 (pentamidine, IN) |
| phenol-matrixectomy | Phenol (liquefied, 80–88%) — chemical matrixectomy | 1 | 8233 → — (—) | — | — |
| pralidoxime | Pralidoxime chloride | 3 | 8616 → — (—) | pralidoxime (34345) | 34345 (pralidoxime, IN) |
| praziquantel | praziquantel | 1 | 8612 → — (—) | praziquantel (8628) | 8628 (praziquantel, IN) |
| premix-insulin-30-70 | Biphasic insulin 30/70 | 1 | 311049 → — (—) | — | — |
| pretomanid | Pretomanid | 4 | 2362859 → — (—) | pretomanid (2198359) | 2198359 (pretomanid, IN) |
| procaine-benzylpenicillin | Procaine benzylpenicillin | 1 | 8986 → — (—) | penicillin G (7980) | 7980 (penicillin G, IN) |
| procyclidine | Procyclidine | 1 | 8807 → — (—) | procyclidine (8718) | 8718 (procyclidine, IN) |
| propylthiouracil | Propylthiouracil (PTU) | 2 | 8810 → — (—) | propylthiouracil (8794) | 8794 (propylthiouracil, IN) |
| prothrombin-complex-concentrate | Prothrombin complex concentrate (4-factor) | 4 | 1356009 → — (—) | factor IX complex (1670383) | 1670383 (factor IX complex, IN) |
| pyrantel-pamoate | Pyrantel pamoate | 2 | 9258 → — (—) | pyrantel (8984) | 8984 (pyrantel, IN) |
| pyrazinamide | pyrazinamide | 2 | 8988 → — (—) | pyrazinamide (8987) | 8987 (pyrazinamide, IN) |
| pyridostigmine | Pyridostigmine bromide | 2 | 8836 → — (—) | pyridostigmine (9000) | 9000 (pyridostigmine, IN) |
| pyridoxine | pyridoxine (vitamin B6) | 1 | 8696 → — (—) | pyridoxine (684879) | 684879 (pyridoxine, IN) |
| pyrimethamine | Pyrimethamine | 3 | 8807 → — (—) | pyrimethamine (9010) | 9010 (pyrimethamine, IN) |
| rabies-immunoglobulin | Human rabies immunoglobulin (HRIG) | 2 | 32523 → — (—) | rabies immune globulin, human (89886) | 89886 (rabies immune globulin, human, IN) |
| raltegravir | Raltegravir | 3 | 732506 → — (—) | raltegravir (719872) | 719872 (raltegravir, IN) |
| ranolazine | Ranolazine | 4 | 342731 → — (—) | ranolazine (35829) | 35829 (ranolazine, IN) |
| rasburicase | rasburicase | 3 | 284604 → — (—) | rasburicase (283821) | 283821 (rasburicase, IN) |
| rivaroxaban | rivaroxaban | 2 | 859258 → — (—) | rivaroxaban (1114195) | 1114195 (rivaroxaban, IN) |
| sevelamer | Sevelamer carbonate | 4 | 381536 → — (—) | sevelamer (214824) | 214824 (sevelamer, IN) |
| silver-nitrate-cautery | Silver nitrate (topical cautery) | 1 | 9663 → — (—) | silver nitrate (9789) | 9789 (silver nitrate, IN) |
| sodium-nitroprusside | Sodium nitroprusside | 3 | 7437 → — (—) | nitroprusside (7476) | 7476 (nitroprusside, IN) |
| sodium-stibogluconate | Sodium stibogluconate | 4 | 9942 → — (—) | sodium stibogluconate (8010) | 8010 (sodium stibogluconate, IN) |
| solifenacin | Solifenacin | 2 | 543475 → — (—) | solifenacin (322167) | 322167 (solifenacin, IN) |
| streptomycin | Streptomycin | 3 | 10118 → — (—) | streptomycin (10109) | 10109 (streptomycin, IN) |
| sugammadex | Sugammadex | 3 | 1361049 → — (—) | sugammadex (1726988) | 1726988 (sugammadex, IN) |
| sulfadoxine-pyrimethamine | sulfadoxine + pyrimethamine | 1 | 1721 → — (—) | sulfadoxine (10173) + pyrimethamine (9010) | 203218 (pyrimethamine / sulfadoxine, MIN) |
| surfactant-poractant | poractant alfa (porcine surfactant) | 3 | 33677 → — (—) | poractant alfa (236381) | 236381 (poractant alfa, IN) |
| tafenoquine | Tafenoquine | 3 | 2058804 → — (—) | tafenoquine (2054023) | 2054023 (tafenoquine, IN) |
| tenecteplase | tenecteplase | 3 | 204293 → — (—) | tenecteplase (259280) | 259280 (tenecteplase, IN) |
| tenofovir-alafenamide | tenofovir alafenamide | 2 | 1772737 → — (—) | tenofovir alafenamide (1721603) | 1721603 (tenofovir alafenamide, IN) |
| tenofovir-disoproxil | tenofovir disoproxil fumarate | 2 | 352005 → — (—) | tenofovir disoproxil (300195) | 300195 (tenofovir disoproxil, IN) |
| terlipressin | terlipressin | 3 | 70833 → — (—) | terlipressin (57048) | 57048 (terlipressin, IN) |
| tetanus-immunoglobulin | Human tetanus immunoglobulin (HTIG) | 2 | 10515 → — (—) | tetanus immune globulin (1727875) | 1727875 (tetanus immune globulin, IN) |
| tetanus-toxoid-vaccine | Tetanus toxoid-containing vaccine (Td/TT) | 1 | 5811 → — (—) | — | — |
| tolvaptan | Tolvaptan | 4 | 850432 → — (—) | tolvaptan (358257) | 358257 (tolvaptan, IN) |
| ursodeoxycholic-acid | Ursodeoxycholic acid | 4 | 11048 → — (—) | ursodeoxycholate (62427) | 62427 (ursodeoxycholate, IN) |
| valaciclovir | valaciclovir | 2 | 39989 → — (—) | valacyclovir (73645) | 73645 (valacyclovir, IN) |
| valganciclovir | Valganciclovir | 4 | 284561 → — (—) | valganciclovir (275891) | 275891 (valganciclovir, IN) |
| varenicline | Varenicline | 3 | 609329 → — (—) | varenicline (591622) | 591622 (varenicline, IN) |
| vitamin-a | retinyl palmitate (vitamin A) | 1 | 11247 → — (—) | vitamin A (11246) | 11246 (vitamin A, IN) |
| yellow-fever-vaccine | Yellow fever vaccine (17D) | 1 | 1657247 → — (—) | yellow fever virus strain 17D-204 live antigen (804187) | 804187 (yellow fever virus strain 17D-204 live antigen, IN) |
| zidovudine | Zidovudine | 2 | 11346 → — (—) | zidovudine (11413) | 11413 (zidovudine, IN) |
| zoledronic-acid | Zoledronic acid | 3 | 77676 → — (—) | zoledronic acid (77655) | 77655 (zoledronic acid, IN) |

## Codes shared by several records (20)

`DrugCodeIndex` keeps the last record indexed, so every other record sharing
the code is unreachable by RxNorm and the code resolves to the slug shown.

| code | records (bundle order) | currently resolves to |
|---|---|---|
| 10600 | timolol-eye-drops, timolol-ophthalmic | timolol-ophthalmic |
| 1364430 | apixaban, latanoprost | latanoprost |
| 1422089 | doxylamine-pyridoxine, mirabegron | mirabegron |
| 20610 | cetirizine, cabergoline | cabergoline |
| 2191 | cefotaxime, ceftazidime, cefazolin, cefixime | cefixime |
| 281 | aciclovir, aciclovir-iv | aciclovir-iv |
| 342731 | atomoxetine, ranolazine | ranolazine |
| 36117 | salmeterol, sevoflurane | sevoflurane |
| 37798 | tranexamic-acid, tamsulosin | tamsulosin |
| 4053 | erythromycin, esmolol | esmolol |
| 5093 | haloperidol, haloperidol-decanoate | haloperidol-decanoate |
| 5454 | hydroxyurea, hyoscine-butylbromide | hyoscine-butylbromide |
| 6915 | metoclopramide, mifepristone | mifepristone |
| 703 | amiodarone, amphotericin-b, mesalazine | mesalazine |
| 723 | amoxicillin, amoxicillin-clavulanate | amoxicillin-clavulanate |
| 7242 | naloxone, naloxone-detail | naloxone-detail |
| 725 | amantadine, nicorandil | nicorandil |
| 7393 | nevirapine, nicotinamide | nicotinamide |
| 8163 | ors, ipratropium-nebulised, phenylephrine | phenylephrine |
| 8807 | pyrimethamine, procyclidine | procyclidine |
