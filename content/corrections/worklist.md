# Content corrections worklist

Generated 2026-09-18T22:18:56.521Z by `npm run corrections:propose`.
Machine-verifiable fixes are in `proposals.json` (213 RxNorm
corrections, reviewed in the queue under domain `corrections`). Everything
below needs clinical or editorial judgement — there is no free authoritative
source to propose these fixes from automatically.

## Quarantined RxNorm codes without a proposal (16)

No single ingredient or multi-ingredient RxNorm concept was found for the INN;
choose the right code (or remove it) by hand.

| slug | current code | verdict | concept |
|---|---|---|---|
| atazanavir-ritonavir | 352167 | code-not-found | — |
| cabotegravir-rilpivirine-injectable | 2399215 | code-not-found | — |
| carbetocin | 2376767 | code-not-found | — |
| delamanid | 1422022 | code-not-found | — |
| hepatitis-a-vaccine | 73178 | name-mismatch | iloperidone |
| influenza-vaccine | 88487 | code-not-found | — |
| intravenous-immunoglobulin | 857349 | code-not-found | — |
| intravenous-lipid-emulsion | 252181 | code-not-found | — |
| mmr-vaccine | 38398 | code-not-found | — |
| nirmatrelvir-ritonavir | 2587892 | partial-combination | nirmatrelvir |
| ors | 8163 | name-mismatch | phenylephrine |
| phenol-matrixectomy | 8233 | code-not-found | — |
| premix-insulin-30-70 | 311049 | code-not-found | — |
| rabies-vaccine | 8674 | name-mismatch | prenylamine |
| ringer-lactate | 1807630 | name-mismatch | 25 ML sodium chloride 9 MG/ML Injection |
| tetanus-toxoid-vaccine | 5811 | code-not-found | — |

## RxNorm codes the corrections will make shared (7)

After the proposals are applied these codes are claimed by records with
different INN text — usually a duplicate monograph. The resolver refuses shared
codes (no match rather than a wrong match); merge or retire the duplicate.

| RxNorm | records |
|---|---|
| 4337 | fentanyl (fentanyl); fentanyl-patch (Fentanyl transdermal patch) |
| 4850 | glucose-50 (glucose 50 % (dextrose 50 %)); dextrose-10 (glucose 10 % (dextrose 10 %)) |
| 5093 | haloperidol (haloperidol); haloperidol-decanoate (Haloperidol decanoate (long-acting injectable)) |
| 6373 | levonorgestrel-ec (levonorgestrel (emergency contraception)); levonorgestrel-ius (Levonorgestrel intrauterine system) |
| 732 | amphotericin-b (amphotericin B (liposomal preferred)); liposomal-amphotericin-b (Liposomal amphotericin B) |
| 7980 | benzathine-penicillin (benzathine benzylpenicillin); benzylpenicillin (Benzylpenicillin (penicillin G)); procaine-benzylpenicillin (Procaine benzylpenicillin) |
| 8638 | prednisolone (prednisolone); prednisolone-acetate-ophthalmic (Prednisolone acetate (ophthalmic)) |

## ATC codes shared by different molecules (24)

The resolver refuses these codes, so ATC-only EHR messages for them get no
match. Fix the wrong assignment(s); variants of one molecule written with
different INN text (e.g. "cefalexin" / "cephalexin") only need consistent INNs.

| ATC | records |
|---|---|
| A04AD12 | aprepitant (Aprepitant); aprepitant-iv (aprepitant); fosaprepitant (fosaprepitant) |
| J01EE01 | cotrimoxazole (sulfamethoxazole + trimethoprim); co-trimoxazole (sulfamethoxazole + trimethoprim); co-trimoxazole-pjp (co-trimoxazole (PJP prophylaxis dose)) |
| J02AA01 | amphotericin-b (amphotericin B (liposomal preferred)); liposomal-amphotericin-b (Liposomal amphotericin B); amphotericin-b-deoxycholate (amphotericin B deoxycholate) |
| J05AF07 | tenofovir-disoproxil (tenofovir disoproxil fumarate); tenofovir-disoproxil-fumarate (tenofovir disoproxil fumarate); tenofovir (tenofovir (umbrella)) |
| N05AX13 | paliperidone-palmitate (Paliperidone palmitate (long-acting injectable)); paliperidone-lai (paliperidone palmitate (LAI)); paliperidone (paliperidone) |
| A10AE04 | insulin-glargine (insulin glargine); insulin-glargine-u300 (insulin glargine U300) |
| A11CC05 | cholecalciferol (Cholecalciferol (vitamin D3)); vitamin-d (colecalciferol (vitamin D3)) |
| B05CX01 | glucose-50 (glucose 50 % (dextrose 50 %)); dextrose-10 (glucose 10 % (dextrose 10 %)) |
| B05XA03 | sodium-chloride-0-9 (sodium chloride 0.9 %); hypertonic-saline-3 (Sodium chloride 3% (hypertonic saline)) |
| C02AC01 | clonidine-er-adhd (clonidine ER); clonidine (clonidine) |
| G04CB01 | finasteride (finasteride); finasteride-5mg (finasteride 5 mg) |
| H05BA01 | calcitonin-salmon (Calcitonin (salmon)); calcitonin (salmon calcitonin) |
| J01DB01 | cefalexin (cefalexin); cephalexin (cephalexin) |
| J05AE08 | atazanavir-ritonavir (Atazanavir/ritonavir); atazanavir (atazanavir) |
| J07AM01 | tetanus-toxoid-vaccine (Tetanus toxoid-containing vaccine (Td/TT)); tetanus (tetanus toxoid vaccine) |
| L01XX05 | hydroxyurea (hydroxycarbamide (hydroxyurea)); hydroxyurea-paediatric-scd (Hydroxyurea (hydroxycarbamide)) |
| L02AE02 | leuprorelin (Leuprorelin); leuprolide (leuprolide) |
| L04AD01 | ciclosporin (ciclosporin); cyclosporine (cyclosporine) |
| N02AB03 | fentanyl (fentanyl); fentanyl-patch (Fentanyl transdermal patch) |
| N05AD01 | haloperidol (haloperidol); haloperidol-decanoate (Haloperidol decanoate (long-acting injectable)) |
| N05AH03 | olanzapine (olanzapine); olanzapine-lai (olanzapine pamoate (LAI)) |
| N05AN01 | lithium (lithium carbonate); lithium-er (lithium (extended-release)) |
| N06AX27 | brexanolone (brexanolone); esketamine-nasal (esketamine (intranasal)) |
| R03BA01 | beclomethasone-inhaled (beclomethasone dipropionate (inhaled)); beclometasone (beclometasone (inhaled)) |

## SNOMED CT codes shared by different molecules (48)

SNOMED is not served (CONTENT_SNOMED_ENABLED off), but these codes must be
audited before it is enabled — several are shared by many unrelated drugs.

| SNOMED | records |
|---|---|
| 387467008 | 13: ciprofloxacin (ciprofloxacin); hydrocortisone (hydrocortisone (cortisol)); gentamicin (gentamicin); nifedipine (nifedipine); metoclopramide (metoclopramide); primaquine (primaquine); amikacin (amikacin); ipratropium-nebulised (ipratropium bromide (nebulised)); mesna (mesna); promethazine (Promethazine); cefazolin (Cefazolin); neostigmine (Neostigmine); diphenhydramine (Diphenhydramine) |
| 387525005 | 8: meropenem (meropenem); trimethoprim (trimethoprim); salmeterol (salmeterol); indapamide (indapamide); nimodipine (nimodipine); suxamethonium (suxamethonium (succinylcholine)); etomidate (etomidate); isosorbide-mononitrate (isosorbide-5-mononitrate) |
| 387159009 | 7: rifampicin (rifampicin); pyridoxine (pyridoxine (vitamin B6)); vitamin-a (retinyl palmitate (vitamin A)); benzathine-penicillin (benzathine benzylpenicillin); ringer-lactate (Ringer's lactate (Hartmann's solution)); chloramphenicol-eye-drops (chloramphenicol 0.5 % eye drops); cefotaxime (cefotaxime) |
| 387207008 | 7: ibuprofen (ibuprofen); phenobarbital (Phenobarbital); ganciclovir-iv (Ganciclovir (intravenous)); procyclidine (Procyclidine); fentanyl-patch (Fentanyl transdermal patch); oxycodone (Oxycodone); fenofibrate (Fenofibrate) |
| 387458008 | 5: aspirin (acetylsalicylic acid); naloxone (naloxone); activated-charcoal (Activated charcoal); sodium-nitroprusside (Sodium nitroprusside); leuprorelin (Leuprorelin) |
| 421712001 | 5: miltefosine (Miltefosine); atomoxetine (Atomoxetine); aprepitant (Aprepitant); lanreotide (Lanreotide); raltegravir (Raltegravir) |
| 421736007 | 5: buprenorphine-naloxone (Buprenorphine/naloxone); solifenacin (Solifenacin); paliperidone-palmitate (Paliperidone palmitate (long-acting injectable)); ticagrelor (Ticagrelor); fondaparinux (Fondaparinux) |
| 108996001 | 4: cefuroxime (Cefuroxime); rituximab (Rituximab); mycophenolate-mofetil (Mycophenolate mofetil); tacrolimus (Tacrolimus) |
| 387541003 | 4: paromomycin-im (Paromomycin (IM)); nifurtimox (Nifurtimox); spiramycin (Spiramycin); streptomycin (Streptomycin) |
| 108978003 | 3: timolol-eye-drops (Timolol (ophthalmic)); clozapine (Clozapine); infliximab (Infliximab) |
| 108988002 | 3: carbimazole (Carbimazole); haloperidol-decanoate (Haloperidol decanoate (long-acting injectable)); sotalol (Sotalol) |
| 108999008 | 3: cefepime (Cefepime); milrinone (Milrinone); acamprosate (Acamprosate) |
| 1156355002 | 3: tafenoquine (Tafenoquine); cabotegravir-rilpivirine-injectable (Cabotegravir + rilpivirine (long-acting injectable)); doravirine (Doravirine) |
| 387152000 | 3: cotrimoxazole (sulfamethoxazole + trimethoprim); pyrazinamide (pyrazinamide); azathioprine (azathioprine) |
| 387165009 | 3: naproxen (Naproxen); methylphenidate (Methylphenidate); sevoflurane (Sevoflurane) |
| 387503009 | 3: labetalol (labetalol); metoprolol (metoprolol tartrate / succinate); ceftazidime (ceftazidime) |
| 412210000 | 3: insulin-regular (regular human insulin (soluble)); insulin-aspart (insulin aspart); premix-insulin-30-70 (Biphasic insulin 30/70) |
| 412410003 | 3: ezetimibe (ezetimibe); surfactant-poractant (poractant alfa (porcine surfactant)); tiotropium (tiotropium) |
| 108518002 | 2: sucralfate (sucralfate); piperacillin-tazobactam (piperacillin + tazobactam) |
| 108774008 | 2: gabapentin (gabapentin); oseltamivir (oseltamivir) |
| 108990001 | 2: propylthiouracil (Propylthiouracil (PTU)); filgrastim (Filgrastim (recombinant G-CSF)) |
| 386845007 | 2: risperidone (Risperidone); aripiprazole (Aripiprazole) |
| 386849001 | 2: olanzapine (olanzapine); quetiapine (Quetiapine) |
| 387079009 | 2: n-acetylcysteine (N-acetylcysteine (acetylcysteine)); diethylcarbamazine (Diethylcarbamazine (DEC)) |
| 387106008 | 2: dantrolene (Dantrolene sodium); atovaquone (Atovaquone) |
| 387145002 | 2: budesonide-inhaled (budesonide (inhaled)); aciclovir-iv (Aciclovir (intravenous)) |
| 387151005 | 2: doxazosin (doxazosin); mesalazine (mesalazine (5-aminosalicylic acid)) |
| 387153005 | 2: dapsone (dapsone); rocuronium (rocuronium) |
| 387155006 | 2: nitrous-oxide (Nitrous oxide (50 % with O₂ — Entonox)); nicorandil (Nicorandil) |
| 387166005 | 2: fluoxetine (fluoxetine); valaciclovir (valaciclovir) |
| 387180001 | 2: liposomal-amphotericin-b (Liposomal amphotericin B); bupropion (Bupropion) |
| 387184005 | 2: ondansetron (ondansetron); amphotericin-b (amphotericin B (liposomal preferred)) |
| 387196004 | 2: lorazepam (lorazepam); cycloserine (Cycloserine) |
| 387286002 | 2: methadone (methadone); ketamine (ketamine) |
| 387381009 | 2: methotrexate (methotrexate); betamethasone-topical (betamethasone valerate (topical)) |
| 387390002 | 2: sodium-chloride-0-9 (sodium chloride 0.9 %); hypertonic-saline-3 (Sodium chloride 3% (hypertonic saline)) |
| 387424009 | 2: digoxin (digoxin); amiodarone (amiodarone) |
| 387440002 | 2: atropine-sulphate (Atropine sulphate); flecainide (Flecainide) |
| 387480006 | 2: lidocaine (lidocaine (lignocaine)); clindamycin (Clindamycin) |
| 387485004 | 2: ephedrine (Ephedrine); pyridostigmine (Pyridostigmine bromide) |
| 387525002 | 2: mebendazole (Mebendazole); hydroxyzine (Hydroxyzine) |
| 395998005 | 2: proxymetacaine (Proxymetacaine (proparacaine, ophthalmic)); procaine-benzylpenicillin (Procaine benzylpenicillin) |
| 404820001 | 2: omalizumab (Omalizumab); cinacalcet (Cinacalcet) |
| 414603009 | 2: semaglutide (Semaglutide); liraglutide (Liraglutide) |
| 418791001 | 2: anti-d-immunoglobulin (Anti-D immunoglobulin (Rho(D))); tetanus-immunoglobulin (Human tetanus immunoglobulin (HTIG)) |
| 421665008 | 2: dutasteride (Dutasteride); ranolazine (Ranolazine) |
| 67866001 | 2: glucose-50 (glucose 50 % (dextrose 50 %)); dextrose-10 (glucose 10 % (dextrose 10 %)) |
| 703712009 | 2: dolutegravir (dolutegravir); edoxaban (edoxaban) |

## Candidate duplicate monographs (26)

Same RxNorm ingredient(s) and routes. Many are deliberately separate (salts,
strengths, formulations) — decide per group: keep both, merge, or retire one
(retiring requires no other record to reference the slug).

| records |
|---|
| amoxicillin-clavulanate (amoxicillin + clavulanic acid); co-amoxiclav (amoxicillin + clavulanic acid) |
| tenofovir-disoproxil (tenofovir disoproxil fumarate); tenofovir-disoproxil-fumarate (tenofovir disoproxil fumarate) |
| benzathine-penicillin (benzathine benzylpenicillin); benzylpenicillin (Benzylpenicillin (penicillin G)); procaine-benzylpenicillin (Procaine benzylpenicillin) |
| artesunate-iv (artesunate (parenteral)); artesunate (artesunate) |
| glucose-50 (glucose 50 % (dextrose 50 %)); dextrose-10 (glucose 10 % (dextrose 10 %)) |
| sodium-chloride-0-9 (sodium chloride 0.9 %); hypertonic-saline-3 (Sodium chloride 3% (hypertonic saline)) |
| aciclovir (aciclovir (acyclovir)); acyclovir (aciclovir) |
| hydroxyurea (hydroxycarbamide (hydroxyurea)); hydroxyurea-paediatric-scd (Hydroxyurea (hydroxycarbamide)) |
| finasteride (finasteride); finasteride-5mg (finasteride 5 mg) |
| amphotericin-b (amphotericin B (liposomal preferred)); liposomal-amphotericin-b (Liposomal amphotericin B) |
| clotrimazole-topical (clotrimazole (topical 1 %)); clotrimazole (clotrimazole) |
| primaquine (primaquine); primaquine-radical (primaquine (radical cure)) |
| insulin-aspart (insulin aspart); insulin-aspart-faster (insulin aspart (faster-acting)) |
| ketamine (ketamine); ketamine-iv-depression (ketamine (IV, off-label depression)) |
| timolol-eye-drops (Timolol (ophthalmic)); timolol (timolol) |
| cholecalciferol (Cholecalciferol (vitamin D3)); vitamin-d (colecalciferol (vitamin D3)) |
| esmolol (Esmolol); noradrenaline-vasopressin-fixed-combo (esmolol) |
| anti-d-immunoglobulin (Anti-D immunoglobulin (Rho(D))); rhig (anti-D (Rh0) immunoglobulin) |
| ribavirin-oral (Ribavirin (oral)); ribavirin (ribavirin) |
| anastrozole (Anastrozole); anastrozole-extended (anastrozole) |
| mycophenolate-mofetil (Mycophenolate mofetil); mycophenolate (mycophenolate mofetil) |
| leuprorelin (Leuprorelin); leuprolide (leuprolide) |
| paliperidone-palmitate (Paliperidone palmitate (long-acting injectable)); paliperidone-lai (paliperidone palmitate (LAI)) |
| sildenafil-pah (sildenafil); sildenafil (sildenafil) |
| co-trimoxazole (sulfamethoxazole + trimethoprim); co-trimoxazole-pjp (co-trimoxazole (PJP prophylaxis dose)) |
| cefalexin (cefalexin); cephalexin (cephalexin) |

## X / X-detail monograph pairs (33)

Pairs where a `-detail` record duplicates a base monograph. Confirm this split
is intended; if not, merge into one record.

- praziquantel / praziquantel-detail
- naloxone / naloxone-detail
- ivermectin / ivermectin-detail
- ezetimibe / ezetimibe-detail
- sacubitril-valsartan / sacubitril-valsartan-detail
- voriconazole / voriconazole-detail
- oseltamivir / oseltamivir-detail
- mifepristone / mifepristone-detail
- rosuvastatin / rosuvastatin-detail
- octreotide / octreotide-detail
- nifurtimox / nifurtimox-detail
- mefloquine / mefloquine-detail
- memantine / memantine-detail
- sofosbuvir-velpatasvir / sofosbuvir-velpatasvir-detail
- entecavir / entecavir-detail
- tafenoquine / tafenoquine-detail
- zoledronic-acid / zoledronic-acid-detail
- alendronate / alendronate-detail
- methylphenidate / methylphenidate-detail
- varenicline / varenicline-detail
- acamprosate / acamprosate-detail
- tocilizumab / tocilizumab-detail
- cyclophosphamide / cyclophosphamide-detail
- doxorubicin / doxorubicin-detail
- cisplatin / cisplatin-detail
- dutasteride / dutasteride-detail
- doravirine / doravirine-detail
- ranolazine / ranolazine-detail
- rivastigmine / rivastigmine-detail
- galantamine / galantamine-detail
- imatinib / imatinib-detail
- nintedanib / nintedanib-detail
- tenofovir-alafenamide / tenofovir-alafenamide-detail
