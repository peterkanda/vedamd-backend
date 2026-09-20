# Manufacturer label match report

Generated 2026-09-17T14:04:33.414Z by `npm run labels:ingest`. Draft reference
content — see docs/manufacturer-label-licensing.md before promotion.

- Drugs in this run: 855
- Matched to ≥1 US label: 656
- Label records in content/labels/manufacturer-labels.json (all runs): 830 — by application type: NDA 561, BLA 76, ANDA 181, other 12


## RxNorm code disagrees with INN (70)

The drug record’s `rxnorm` resolves to a different ingredient than its INN. No label attached — fix the record’s code first.

| slug | INN | KEML level | detail |
|---|---|---|---|
| alendronate | Alendronate | 2 | INN → alendronate; rxnorm 595 → algestone |
| amantadine | Amantadine | 2 | INN → amantadine; rxnorm 725 → amphetamine |
| amoxicillin-clavulanate | amoxicillin + clavulanic acid | 2 | INN → amoxicillin + clavulanate; rxnorm 723 → amoxicillin |
| amphotericin-b | amphotericin B (liposomal preferred) | 3 | INN → amphotericin B; rxnorm 703 → amiodarone |
| artemether-lumefantrine | artemether + lumefantrine | 1 | INN → artemether + lumefantrine; rxnorm 847232 → insulin glargine |
| bedaquiline | Bedaquiline | 4 | INN → bedaquiline; rxnorm 1311327 → Sus scrofa embryo preparation |
| cabergoline | Cabergoline | 3 | INN → cabergoline; rxnorm 20610 → cetirizine |
| caspofungin | Caspofungin | 4 | INN → caspofungin; rxnorm 352387 → lovastatin + niacin |
| cefazolin | Cefazolin | 2 | INN → cefazolin; rxnorm 2191 → ceftazidime |
| cefixime | Cefixime | 3 | INN → cefixime; rxnorm 2191 → ceftazidime |
| cefotaxime | cefotaxime | 2 | INN → cefotaxime; rxnorm 2191 → ceftazidime |
| cefuroxime | Cefuroxime | 2 | INN → cefuroxime; rxnorm 2231 → cephalexin |
| chlorhexidine-topical | Chlorhexidine (digluconate) | 1 | INN → chlorhexidine; rxnorm 2353 → clorazepate |
| cholecalciferol | Cholecalciferol (vitamin D3) | 1 | INN → cholecalciferol; rxnorm 11253 → vitamin D |
| combined-oral-contraceptive | ethinylestradiol + levonorgestrel (combined oral contraceptive) | 1 | INN → ethinyl estradiol + levonorgestrel; rxnorm 748962 → norethindrone |
| cotrimoxazole | sulfamethoxazole + trimethoprim | 1 | INN → sulfamethoxazole + trimethoprim; rxnorm 10180 → sulfamethoxazole |
| cycloserine | Cycloserine | 4 | INN → cycloserine; rxnorm 3000 → cyclopenthiazide |
| dapsone | dapsone | 2 | INN → dapsone; rxnorm 3008 → cyclosporine |
| desferrioxamine | Desferrioxamine (deferoxamine) | 4 | INN → deferoxamine; rxnorm 3290 → dextromoramide |
| doravirine | Doravirine | 3 | INN → doravirine; rxnorm 2059015 → rivaroxaban |
| doxazosin | doxazosin | 2 | INN → doxazosin; rxnorm 3356 → dicloxacillin |
| ergometrine | Ergometrine (ergonovine) | 1 | INN → ergonovine; rxnorm 4024 → ergoloid mesylates, USP |
| esmolol | Esmolol | 3 | INN → esmolol; rxnorm 4053 → erythromycin |
| ferrous-sulphate | ferrous sulphate | 1 | INN → ferrous sulfate; rxnorm 4452 → fludrocortisone |
| flecainide | Flecainide | 3 | INN → flecainide; rxnorm 4495 → flupenthixol |
| gliclazide | Gliclazide | 1 | INN → gliclazide; rxnorm 25789 → glimepiride |
| hydroxocobalamin | Hydroxocobalamin | 3 | INN → hydroxocobalamin; rxnorm 5933 → iodine |
| hydroxyzine | Hydroxyzine | 1 | INN → hydroxyzine; rxnorm 5552 → hydroxyurea |
| infliximab | Infliximab | 4 | INN → infliximab; rxnorm 253337 → bevacizumab |
| insulin-degludec | Insulin degludec | 3 | INN → insulin degludec; rxnorm 1652640 → insulin lispro |
| ipratropium-nebulised | ipratropium bromide (nebulised) | 1 | INN → ipratropium; rxnorm 8163 → phenylephrine |
| isosorbide-mononitrate | isosorbide-5-mononitrate | 2 | INN → isosorbide; rxnorm 6086 → juniper tar |
| ivermectin | ivermectin | 1 | INN → ivermectin; rxnorm 30121 → moclobemide |
| latanoprost | Latanoprost (ophthalmic) | 1 | INN → latanoprost; rxnorm 1364430 → apixaban |
| leuprorelin | Leuprorelin | 3 | INN → leuprolide; rxnorm 6531 → lypressin |
| linezolid | linezolid | 3 | INN → linezolid; rxnorm 284635 → salmeterol + fluticasone |
| lithium | lithium carbonate | 2 | INN → lithium carbonate; rxnorm 6448 → lithium |
| lopinavir-ritonavir | Lopinavir/ritonavir | 2 | INN → lopinavir + ritonavir; rxnorm 597722 → ribavirin |
| magnesium-sulphate | magnesium sulphate | 1 | INN → magnesium sulfate; rxnorm 6582 → magnesium oxide |
| mebendazole | Mebendazole | 1 | INN → mebendazole; rxnorm 6711 → melatonin |
| medroxyprogesterone-depot | medroxyprogesterone acetate (depot, DMPA) | 1 | INN → medroxyprogesterone; rxnorm 6845 → methocarbamol |
| mesalazine | mesalazine (5-aminosalicylic acid) | 2 | INN → mesalamine; rxnorm 703 → amiodarone |
| mifepristone | mifepristone | 2 | INN → mifepristone; rxnorm 6915 → metoclopramide |
| misoprostol | misoprostol | 1 | INN → misoprostol; rxnorm 44 → mesna |
| n-acetylcysteine | N-acetylcysteine (acetylcysteine) | 2 | INN → acetylcysteine; rxnorm 199 → acetyldigoxins |
| nevirapine | nevirapine | 2 | INN → nevirapine; rxnorm 7393 → niacin |
| niclosamide | Niclosamide | 2 | INN → niclosamide; rxnorm 7421 → nifurtimox |
| nicorandil | Nicorandil | 3 | INN → nicorandil; rxnorm 725 → amphetamine |
| nicotinamide | Nicotinamide (niacinamide) | 1 | INN → niacinamide; rxnorm 7393 → niacin |
| nintedanib | Nintedanib | 4 | INN → nintedanib; rxnorm 1594659 → alemtuzumab |
| nirmatrelvir-ritonavir | Nirmatrelvir/ritonavir | 4 | INN → nirmatrelvir + ritonavir; rxnorm 2587892 → nirmatrelvir |
| nitrous-oxide | Nitrous oxide (50 % with O₂ — Entonox) | 2 | INN → nitrous oxide; rxnorm 7440 → nitrazepam |
| omalizumab | Omalizumab | 4 | INN → omalizumab; rxnorm 284679 → alemtuzumab |
| permethrin-topical | permethrin (topical 5 % cream) | 1 | INN → permethrin; rxnorm 8156 → phenylalanine |
| piperacillin-tazobactam | piperacillin + tazobactam | 2 | INN → piperacillin + tazobactam; rxnorm 73494 → telmisartan |
| prednisolone | prednisolone | 1 | INN → prednisolone; rxnorm 8640 → prednisone |
| primaquine | primaquine | 2 | INN → primaquine; rxnorm 8783 → propolis |
| proxymetacaine | Proxymetacaine (proparacaine, ophthalmic) | 2 | INN → proparacaine; rxnorm 8814 → epoprostenol |
| rocuronium | rocuronium | 3 | INN → rocuronium; rxnorm 9518 → salicylamide |
| sacubitril-valsartan | sacubitril + valsartan (ARNI) | 2 | INN → sacubitril + valsartan; rxnorm 1656328 → sacubitril |
| sevoflurane | Sevoflurane | 3 | INN → sevoflurane; rxnorm 36117 → salmeterol |
| sofosbuvir-velpatasvir | Sofosbuvir/velpatasvir | 3 | INN → sofosbuvir + velpatasvir; rxnorm 1734918 → cyclophosphamide |
| spiramycin | Spiramycin | 3 | INN → spiramycin; rxnorm 9876 → thiosulfate |
| tamsulosin | tamsulosin | 2 | INN → tamsulosin; rxnorm 37798 → terazosin |
| terbinafine | terbinafine | 2 | INN → terbinafine; rxnorm 10485 → thioguanine |
| tocilizumab | Tocilizumab | 4 | INN → tocilizumab; rxnorm 1009345 → oxibendazole |
| tranexamic-acid | tranexamic acid | 1 | INN → tranexamic acid; rxnorm 37798 → terazosin |
| valproate | Sodium valproate | 2 | INN → valproate; rxnorm 39998 → zonisamide |
| vitamin-k | phytomenadione (vitamin K1) | 1 | INN → vitamin K1; rxnorm 11258 → vitamin K |
| voriconazole | voriconazole | 3 | INN → voriconazole; rxnorm 274786 → telithromycin |

## Ingredient not resolved (45)

RxNav could not resolve the INN. Add an alias to scripts/lib/inn-usan-aliases.json if a US name exists.

| slug | INN | KEML level | detail |
|---|---|---|---|
| amphotericin-b-deoxycholate | amphotericin B deoxycholate |  | no RxNorm ingredient for: amphotericin b deoxycholate |
| bcg-vaccine | BCG vaccine |  | no RxNorm ingredient for: bcg vaccine |
| carbetocin | Carbetocin | 2 | no RxNorm ingredient for: carbetocin |
| cholera-vaccine-oral | oral cholera vaccine (Dukoral / Shanchol / Euvichol) |  | no RxNorm ingredient for: oral cholera vaccine |
| clonidine-er-adhd | clonidine ER |  | no RxNorm ingredient for: clonidine er |
| covid19-mrna-vaccine | COVID-19 mRNA vaccine (Pfizer, Moderna platforms) |  | no RxNorm ingredient for: covid-19 mrna vaccine |
| delamanid | Delamanid | 4 | no RxNorm ingredient for: delamanid |
| dihydroartemisinin-piperaquine | Dihydroartemisinin/piperaquine | 1 | no RxNorm ingredient for: dihydroartemisinin, piperaquine |
| filgotinib | filgotinib |  | no RxNorm ingredient for: filgotinib |
| gadolinium | gadolinium-based contrast agent |  | no RxNorm ingredient for: gadolinium-based contrast agent |
| guanfacine-er | guanfacine ER |  | no RxNorm ingredient for: guanfacine er |
| hpv-9valent | HPV 9-valent vaccine (Gardasil 9) |  | no RxNorm ingredient for: hpv 9-valent vaccine |
| influenza-high-dose | high-dose influenza vaccine |  | no RxNorm ingredient for: high-dose influenza vaccine |
| influenza-laiv | live attenuated influenza vaccine (intranasal, LAIV) |  | no RxNorm ingredient for: live attenuated influenza vaccine |
| influenza-recombinant | recombinant influenza vaccine (Flublok) |  | no RxNorm ingredient for: recombinant influenza vaccine |
| influenza-vaccine | Influenza vaccine (inactivated) | 2 | no RxNorm ingredient for: influenza vaccine |
| insulin-glargine-u300 | insulin glargine U300 |  | no RxNorm ingredient for: insulin glargine u300 |
| interferon-alfa | interferon alfa |  | no RxNorm ingredient for: interferon alfa |
| intravenous-immunoglobulin | Human normal immunoglobulin (IVIG) | 3 | no RxNorm ingredient for: human normal immunoglobulin |
| intravenous-lipid-emulsion | Intravenous lipid emulsion 20% | 4 | no RxNorm ingredient for: intravenous lipid emulsion |
| ipv | inactivated poliovirus vaccine (IPV) |  | no RxNorm ingredient for: inactivated poliovirus vaccine |
| ivig | human normal immunoglobulin (IV) |  | no RxNorm ingredient for: human normal immunoglobulin |
| je-vaccine | Japanese encephalitis vaccine |  | no RxNorm ingredient for: japanese encephalitis vaccine |
| menacwy-vaccine | meningococcal ACWY conjugate vaccine |  | no RxNorm ingredient for: meningococcal acwy conjugate vaccine |
| menb-vaccine | meningococcal serogroup B vaccine |  | no RxNorm ingredient for: meningococcal serogroup b vaccine |
| mmr-vaccine | Measles, mumps and rubella vaccine | 1 | no RxNorm ingredient for: measles, mumps and rubella vaccine |
| opv-bivalent | oral poliovirus vaccine (bOPV/nOPV2) |  | no RxNorm ingredient for: oral poliovirus vaccine |
| pcv13 | pneumococcal conjugate vaccine PCV13 |  | no RxNorm ingredient for: pneumococcal conjugate vaccine pcv13 |
| pcv15 | pneumococcal conjugate vaccine PCV15 |  | no RxNorm ingredient for: pneumococcal conjugate vaccine pcv15 |
| pcv20 | pneumococcal conjugate vaccine PCV20 |  | no RxNorm ingredient for: pneumococcal conjugate vaccine pcv20 |
| peginterferon-alfa | peginterferon alfa |  | no RxNorm ingredient for: peginterferon alfa |
| phenol-matrixectomy | Phenol (liquefied, 80–88%) — chemical matrixectomy | 1 | no RxNorm ingredient for: phenol — chemical matrixectomy |
| pneumococcal | pneumococcal vaccine |  | no RxNorm ingredient for: pneumococcal vaccine |
| polyvalent-snake-antivenom-saimr | Polyvalent snake antivenom (SAIMR) | 3 | no RxNorm ingredient for: polyvalent snake antivenom |
| ppsv23 | pneumococcal polysaccharide vaccine PPSV23 |  | no RxNorm ingredient for: pneumococcal polysaccharide vaccine ppsv23 |
| premix-insulin-30-70 | Biphasic insulin 30/70 | 1 | no RxNorm ingredient for: biphasic insulin 30, 70 |
| rotavirus-vaccine | rotavirus vaccine (oral) |  | no RxNorm ingredient for: rotavirus vaccine |
| rsv | RSV vaccine / monoclonal antibody |  | no RxNorm ingredient for: rsv vaccine, monoclonal antibody |
| rsv-vaccine-maternal | RSV vaccine (maternal, Abrysvo) |  | no RxNorm ingredient for: rsv vaccine |
| rsv-vaccine-older-adults | RSV vaccine (Arexvy/Abrysvo, older adults) |  | no RxNorm ingredient for: rsv vaccine |
| ssri-class | SSRI class |  | no RxNorm ingredient for: ssri class |
| tdap | tetanus-diphtheria-acellular pertussis (Tdap) |  | no RxNorm ingredient for: tetanus-diphtheria-acellular pertussis |
| tetanus | tetanus toxoid vaccine |  | no RxNorm ingredient for: tetanus toxoid vaccine |
| tetanus-toxoid-vaccine | Tetanus toxoid-containing vaccine (Td/TT) | 1 | no RxNorm ingredient for: tetanus toxoid-containing vaccine |
| typhoid-conjugate | typhoid conjugate vaccine (TCV) |  | no RxNorm ingredient for: typhoid conjugate vaccine |

## No US label (84)

Resolved in RxNorm, but no current single-product US label (common for WHO-EML-only medicines and some vaccines). Candidates for a PPB/SAHPRA source once permission is granted.

| slug | INN | KEML level | detail |
|---|---|---|---|
| anti-d-immunoglobulin | Anti-D immunoglobulin (Rho(D)) | 2 | Rho(D) immune globulin (0 candidate labels, none single-matching) |
| artesunate | artesunate |  | artesunate (0 candidate labels, none single-matching) |
| artesunate-amodiaquine | artesunate + amodiaquine |  | artesunate + amodiaquine (0 candidate labels, none single-matching) |
| artesunate-iv | artesunate (parenteral) | 1 | artesunate (0 candidate labels, none single-matching) |
| atazanavir-ritonavir | Atazanavir/ritonavir | 3 | atazanavir + ritonavir (0 candidate labels, none single-matching) |
| atosiban | atosiban |  | atosiban (0 candidate labels, none single-matching) |
| bendroflumethiazide | bendroflumethiazide |  | bendroflumethiazide (0 candidate labels, none single-matching) |
| betamethasone | betamethasone |  | US labels exist only for other routes or strengths (TOPICAL) |
| bictegravir-emtricitabine-taf | bictegravir + emtricitabine + tenofovir alafenamide |  | bictegravir + emtricitabine + tenofovir alafenamide (0 candidate labels, none single-matching) |
| brexanolone | brexanolone |  | brexanolone (0 candidate labels, none single-matching) |
| cabotegravir-rilpivirine-injectable | Cabotegravir + rilpivirine (long-acting injectable) | 4 | cabotegravir + rilpivirine (0 candidate labels, none single-matching) |
| calcitonin | salmon calcitonin |  | salmon calcitonin (0 candidate labels, none single-matching) |
| carbimazole | Carbimazole | 2 | carbimazole (0 candidate labels, none single-matching) |
| chloramphenicol-eye-drops | chloramphenicol 0.5 % eye drops | 1 | cholecalciferol (0 candidate labels, none single-matching) |
| cyclizine | Cyclizine | 1 | cyclizine (0 candidate labels, none single-matching) |
| diethylcarbamazine | Diethylcarbamazine (DEC) | 2 | diethylcarbamazine (0 candidate labels, none single-matching) |
| digoxin-immune-fab | Digoxin-specific antibody fragments (Fab) | 4 | digoxin antibodies Fab fragments (0 candidate labels, none single-matching) |
| diloxanide-furoate | Diloxanide furoate | 3 | diloxanide (0 candidate labels, none single-matching) |
| diphtheria-antitoxin | Diphtheria antitoxin (equine) | 1 | diphtheria antitoxin (0 candidate labels, none single-matching) |
| domperidone | Domperidone | 2 | domperidone (0 candidate labels, none single-matching) |
| elexacaftor-tezacaftor-ivacaftor | elexacaftor + tezacaftor + ivacaftor |  | elexacaftor + tezacaftor + ivacaftor (0 candidate labels, none single-matching) |
| encorafenib-binimetinib | encorafenib + binimetinib |  | encorafenib + binimetinib (0 candidate labels, none single-matching) |
| ethinylestradiol | ethinylestradiol |  | ethinyl estradiol (0 candidate labels, none single-matching) |
| etonogestrel-implant | Etonogestrel subdermal implant | 2 | US labels exist only for other routes or strengths (ORAL) |
| fentanyl-patch | Fentanyl transdermal patch | 2 | US labels exist only for other routes or strengths (ORAL) |
| flucloxacillin | flucloxacillin | 1 | floxacillin (0 candidate labels, none single-matching) |
| fosfomycin-iv | fosfomycin (intravenous) |  | US labels exist only for other routes or strengths (ORAL) |
| fusidic-acid-topical | fusidic acid (topical 2 %) | 2 | fusidate (0 candidate labels, none single-matching) |
| ginger | ginger (Zingiber officinale) |  | ginger extract (0 candidate labels, none single-matching) |
| glycopyrronium-inhaled | glycopyrronium (inhaled) |  | US labels exist only for other routes or strengths (INTRAMUSCULAR+INTRAVENOUS; ORAL; TOPICAL) |
| grapefruit-juice | grapefruit juice |  | grapefruit juice (0 candidate labels, none single-matching) |
| hbig | hepatitis B immunoglobulin |  | hepatitis B immune globulin (0 candidate labels, none single-matching) |
| hepatitis-a-vaccine | Hepatitis A vaccine (inactivated) | 2 | US labels exist only for other routes or strengths (ORAL) |
| hepatitis-b-vaccine | Hepatitis B vaccine (recombinant HBsAg) | 1 | hepatitis B surface antigen vaccine (0 candidate labels, none single-matching) |
| hyoscine-butylbromide | Hyoscine butylbromide | 1 | butylscopolamine (0 candidate labels, none single-matching) |
| hypertonic-saline-3 | Sodium chloride 3% (hypertonic saline) | 4 | US labels exist only for other routes or strengths (CUTANEOUS+NASAL+OPHTHALMIC+TOPICAL; EXTRACORPOREAL; INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAOCULAR; INTRAVASCULAR; INTRAVENOUS; IRRIGATION; NASAL; NASAL+TOPICAL; OPHTHALMIC; ORAL; SUBLINGUAL; TOPICAL) |
| iloprost | iloprost |  | US labels exist only for other routes or strengths (INTRAVENOUS) |
| insulin | insulin (any species) |  | insulin, regular, human (0 candidate labels, none single-matching) |
| insulin-isophane | isophane (NPH) human insulin | 2 | insulin isophane (0 candidate labels, none single-matching) |
| insulin-regular | regular human insulin (soluble) | 2 | insulin, regular, human (0 candidate labels, none single-matching) |
| isavuconazole | isavuconazole (sulfate) |  | isavuconazole (0 candidate labels, none single-matching) |
| lefamulin | lefamulin |  | lefamulin (1 candidate labels, none single-matching) |
| lenacapavir | lenacapavir |  | US labels exist only for other routes or strengths (ORAL) |
| lixisenatide | lixisenatide |  | lixisenatide (0 candidate labels, none single-matching) |
| pegvisomant | pegvisomant |  | pegvisomant (1 candidate labels, none single-matching) |
| procyclidine | Procyclidine | 1 | procyclidine (0 candidate labels, none single-matching) |
| protamine | protamine sulfate |  | protamine sulfate (USP) (0 candidate labels, none single-matching) |
| prothrombin-complex-concentrate | Prothrombin complex concentrate (4-factor) | 4 | factor IX complex (0 candidate labels, none single-matching) |
| pyridoxine | pyridoxine (vitamin B6) | 1 | US labels exist only for other routes or strengths (INTRAMUSCULAR+INTRAVENOUS) |
| rabies-immunoglobulin | Human rabies immunoglobulin (HRIG) | 2 | rabies immune globulin, human (0 candidate labels, none single-matching) |
| rabies-vaccine | Rabies vaccine (purified Vero / chick embryo cell) | 1 | prenylamine (0 candidate labels, none single-matching) |
| rasburicase | rasburicase | 3 | rasburicase (1 candidate labels, none single-matching) |
| rhig | anti-D (Rh0) immunoglobulin |  | Rho(D) immune globulin (0 candidate labels, none single-matching) |
| ribavirin-iv | ribavirin (parenteral) |  | US labels exist only for other routes or strengths (ORAL; RESPIRATORY (INHALATION)) |
| rilpivirine-la | rilpivirine (long-acting) |  | US labels exist only for other routes or strengths (ORAL) |
| rosiglitazone | rosiglitazone |  | rosiglitazone (0 candidate labels, none single-matching) |
| semaglutide | Semaglutide | 3 | US labels exist only for other routes or strengths (ORAL) |
| semaglutide-sc-detail | semaglutide (subcutaneous) |  | US labels exist only for other routes or strengths (ORAL) |
| senna | senna (sennosides) |  | sennosides, USP (0 candidate labels, none single-matching) |
| shingrix | recombinant zoster vaccine (Shingrix) |  | varicella zoster virus glycoprotein E (0 candidate labels, none single-matching) |
| sodium-stibogluconate | Sodium stibogluconate | 4 | sodium stibogluconate (0 candidate labels, none single-matching) |
| sulbactam-durlobactam | sulbactam/durlobactam |  | sulbactam + durlobactam (0 candidate labels, none single-matching) |
| sulfadoxine-pyrimethamine | sulfadoxine + pyrimethamine | 1 | sulfadoxine + pyrimethamine (0 candidate labels, none single-matching) |
| teicoplanin | teicoplanin |  | teicoplanin (0 candidate labels, none single-matching) |
| tenecteplase | tenecteplase | 3 | tenecteplase (2 candidate labels, none single-matching) |
| tetanus-immunoglobulin | Human tetanus immunoglobulin (HTIG) | 2 | tetanus immune globulin (0 candidate labels, none single-matching) |
| tezacaftor-ivacaftor | tezacaftor + ivacaftor |  | tezacaftor + ivacaftor (0 candidate labels, none single-matching) |
| tld-fdc | Tenofovir disoproxil + lamivudine + dolutegravir (TLD) | 2 | tenofovir disoproxil + lamivudine + dolutegravir (0 candidate labels, none single-matching) |
| tolbutamide | tolbutamide |  | tolbutamide (0 candidate labels, none single-matching) |
| trimetazidine | trimetazidine |  | trimetazidine (0 candidate labels, none single-matching) |
| typhoid-vi | Vi polysaccharide typhoid vaccine |  | typhoid Vi polysaccharide vaccine, S typhi Ty2 strain (0 candidate labels, none single-matching) |
| ubrogepant | ubrogepant |  | ubrogepant (0 candidate labels, none single-matching) |
| umeclidinium | umeclidinium |  | US labels exist only for other routes or strengths (ORAL) |
| varicella-vaccine | varicella vaccine |  | varicella-zoster virus vaccine live (Oka-Merck) strain (0 candidate labels, none single-matching) |
| vasopressin | Vasopressin (arginine vasopressin) | 3 | vasopressin (USP) (0 candidate labels, none single-matching) |
| vildagliptin | vildagliptin |  | vildagliptin (0 candidate labels, none single-matching) |
| vitamin-a | retinyl palmitate (vitamin A) | 1 | US labels exist only for other routes or strengths (INTRAMUSCULAR) |
| vitamin-b12 | cyanocobalamin / hydroxocobalamin |  | vitamin B12 + hydroxocobalamin (0 candidate labels, none single-matching) |
| vitamin-d | colecalciferol (vitamin D3) |  | cholecalciferol (0 candidate labels, none single-matching) |
| vzig | varicella-zoster immunoglobulin |  | varicella-zoster immune globulin (0 candidate labels, none single-matching) |
| yellow-fever-vaccine | Yellow fever vaccine (17D) | 1 | yellow fever virus strain 17D-204 live antigen (0 candidate labels, none single-matching) |
| zinc | zinc sulfate / acetate |  | US labels exist only for other routes or strengths (INTRAVENOUS) |
| zopiclone | zopiclone |  | zopiclone (0 candidate labels, none single-matching) |
| zuclopenthixol-decanoate | zuclopenthixol decanoate |  | zuclopenthixol (0 candidate labels, none single-matching) |

## Matched (656)

| slug | INN | routes | reference label |
|---|---|---|---|
| abacavir | Abacavir | ORAL | ZIAGEN (NDA, ViiV Healthcare Company, 2023-09-29) |
| abaloparatide | abaloparatide | SUBCUTANEOUS | Tymlos (NDA, Radius Health, Inc., 2026-08-11) |
| abatacept | abatacept | INTRAVENOUS+SUBCUTANEOUS | ORENCIA (BLA, E.R. Squibb & Sons, L.L.C., 2025-11-13) |
| abemaciclib | abemaciclib | ORAL | Verzenio (NDA, Eli Lilly and Company, 2026-07-13) |
| abiraterone | abiraterone acetate | ORAL | YONSA (NDA, Sun Pharmaceutical Industries, Inc., 2026-06-08) |
| acalabrutinib | acalabrutinib | ORAL | CALQUENCE (NDA, AstraZeneca Pharmaceuticals LP, 2026-02-19) |
| acamprosate | Acamprosate | ORAL | ACAMPROSATE CALCIUM (ANDA, Somerset Therapeutics, LLC, 2026-07-14) |
| acamprosate-detail | acamprosate | ORAL | ACAMPROSATE CALCIUM (ANDA, Somerset Therapeutics, LLC, 2026-07-14) |
| acetazolamide | Acetazolamide | INTRAVENOUS; ORAL | Acetazolamide (ANDA, Heritage Pharmaceuticals Inc. d/b/a Avet Pharmaceuticals Inc., 2026-04-10); Acetazolamide (ANDA, Strides Pharma Science Limited, 2026-08-19) |
| aciclovir | aciclovir (acyclovir) | INTRAVENOUS; ORAL | acyclovir (ANDA, Fresenius Kabi USA, LLC, 2024-11-13); ACYCLOVIR (ANDA, Heritage Pharmaceuticals Inc. d/b/a Avet Pharmaceuticals Inc., 2026-07-24) |
| aciclovir-iv | Aciclovir (intravenous) | INTRAVENOUS | acyclovir (ANDA, Fresenius Kabi USA, LLC, 2024-11-13) |
| aciclovir-topical | aciclovir (topical) | CUTANEOUS; TOPICAL | Acyclovir (ANDA, Alembic Pharmaceuticals Inc., 2025-03-28); Acyclovir (NDA, Teva Pharmaceuticals USA, Inc., 2025-10-23) |
| aclidinium | aclidinium bromide | RESPIRATORY (INHALATION) | Tudorza Pressair (NDA, Covis Pharma US, Inc, 2022-08-01) |
| activated-charcoal | Activated charcoal | ORAL; SUBLINGUAL | ACTIDOSE (other, Padagis US LLC, 2026-07-28); Carbo Vegetabilis 200ck (other, SEVENE USA, 2025-02-11) |
| acyclovir | aciclovir | INTRAVENOUS; ORAL | acyclovir (ANDA, Fresenius Kabi USA, LLC, 2024-11-13); ACYCLOVIR (ANDA, Heritage Pharmaceuticals Inc. d/b/a Avet Pharmaceuticals Inc., 2026-07-24) |
| adalimumab | Adalimumab | SUBCUTANEOUS | AMJEVITA (BLA, Amgen USA Inc., 2026-07-13) |
| adenosine | Adenosine | INTRAVENOUS | Adenosine (ANDA, Sagent Pharmaceuticals, 2026-07-27) |
| adrenaline | adrenaline (epinephrine) | INTRAMUSCULAR; INTRAMUSCULAR+INTRAOCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAMUSCULAR+SUBCUTANEOUS; INTRAVENOUS; SUBCUTANEOUS | Auvi-Q (NDA, kaleo, Inc, 2025-10-02); Epinephrine (NDA, BPI Labs, LLC, 2025-12-26); EPINEPHRINE (NDA, Fresenius Kabi USA, LLC, 2026-07-15); epinephrine (ANDA, American Regent, Inc., 2023-10-01); epinephrine (NDA, Baxter Healthcare Corporation, 2026-03-16); epinephrine (NDA, Amneal Pharmaceuticals of New York LLC, 2026-03-20) |
| afatinib | afatinib | ORAL | Gilotrif (NDA, Boehringer Ingelheim Pharmaceuticals, Inc., 2025-11-13) |
| albendazole | albendazole | ORAL | Albendazole (NDA, Amneal Pharmaceuticals of New York LLC, 2019-09-30) |
| alcohol-ethanol | ethanol | ORAL | X-RAY (other, Boiron, 2023-11-15) |
| alectinib | alectinib | ORAL | ALECENSA (NDA, Genentech, Inc., 2026-08-21) |
| alendronate-detail | alendronate | ORAL | FOSAMAX (NDA, Organon LLC, 2026-03-12) |
| alirocumab | alirocumab | SUBCUTANEOUS | Praluent (BLA, Regeneron Pharmaceuticals, Inc., 2026-07-16) |
| aliskiren | aliskiren | ORAL | Tekturna (NDA, LXO US Inc., 2024-03-07) |
| allopurinol | allopurinol | ORAL | Allopurinol (NDA, Rising Pharma Holdings, Inc., 2026-05-21) |
| alogliptin | alogliptin | ORAL | Alogliptin (NDA, Padagis Israel Pharmaceuticals Ltd, 2025-04-11) |
| ambrisentan | ambrisentan | ORAL | Letairis (NDA, Gilead Sciences, Inc., 2026-06-22) |
| amikacin | amikacin | INTRAMUSCULAR+INTRAVENOUS | amikacin sulfate (ANDA, Sagent Pharmaceuticals, 2026-07-27) |
| amiloride | amiloride | ORAL | amiloride hydrochloride (NDA, Padagis US LLC, 2023-05-05) |
| amiodarone | amiodarone | INTRAVENOUS; ORAL | Nexterone (NDA, Baxter Healthcare Corporation, 2024-04-16); Amiodarone Hydrochloride (ANDA, Dr. Reddy's Labratories Inc., 2026-04-23) |
| amitriptyline | amitriptyline | ORAL | Amitriptyline Hydrochloride (ANDA, Sun Pharmaceutical Industries, Inc., 2026-09-08) |
| amlodipine | amlodipine | ORAL | NORLIQVA (NDA, CMP Pharma, Inc., 2026-02-16) |
| amoxicillin | amoxicillin | ORAL | Amoxicillin (NDA, USAntibiotics, LLC, 2026-07-07) |
| amphetamine | amphetamine | ORAL | Adzenys XR-ODT (NDA, Neos Therapeutics Brands, LLC, 2026-05-06) |
| ampicillin | ampicillin | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | ampicillin (ANDA, Sagent Pharmaceuticals, 2026-07-27); Ampicillin Sodium (ANDA, Sagent Pharmaceuticals, 2026-07-27) |
| anastrozole | Anastrozole | ORAL | ARIMIDEX (NDA, ANI Pharmaceuticals, Inc., 2026-03-02) |
| anastrozole-extended | anastrozole | ORAL | ARIMIDEX (NDA, ANI Pharmaceuticals, Inc., 2026-03-02) |
| anidulafungin | anidulafungin | INTRAVENOUS | ERAXIS (NDA, Roerig, 2025-08-19) |
| anifrolumab | anifrolumab | INTRAVENOUS+SUBCUTANEOUS | SAPHNELO (BLA, AstraZeneca Pharmaceuticals LP, 2026-04-24) |
| apalutamide | apalutamide | ORAL | ERLEADA (NDA, Janssen Products, LP, 2026-07-02) |
| apixaban | apixaban | ORAL | Apixaban (ANDA, Amneal Pharmaceuticals of New York LLC, 2024-05-23) |
| apraclonidine | Apraclonidine (ophthalmic) | OPHTHALMIC | Apraclonidine (NDA, Sandoz Inc, 2024-10-02) |
| aprepitant | Aprepitant | ORAL | EMEND (NDA, Merck Sharp & Dohme LLC, 2024-07-05) |
| aprepitant-iv | aprepitant | INTRAVENOUS; ORAL | CINVANTI (NDA, Heron Therapeutics, Inc., 2026-04-01); EMEND (NDA, Merck Sharp & Dohme LLC, 2024-07-05) |
| aripiprazole | Aripiprazole | ORAL | OPIPZA (NDA, Carwin Pharmaceutical Associates, LLC, 2025-01-30) |
| aripiprazole-lai | aripiprazole (LAI) | INTRAMUSCULAR | Abilify Asimtufii (NDA, Otsuka America Pharmaceutical, Inc, 2025-04-04) |
| asenapine | asenapine | SUBLINGUAL | SAPHRIS (NDA, Allergan, Inc., 2025-01-31) |
| aspirin | acetylsalicylic acid | ORAL | Low Dose Aspirin (other, Strategic Sourcing Services LLC, 2026-09-09) |
| atazanavir | atazanavir | ORAL | REYATAZ (NDA, E.R. Squibb & Sons, L.L.C., 2024-12-05) |
| atenolol | atenolol | ORAL | TENORMIN (NDA, Upsher-Smith Laboratories, LLC, 2025-09-18) |
| atezolizumab | atezolizumab | INTRAVENOUS | TECENTRIQ (BLA, Genentech, Inc., 2026-05-20) |
| atogepant | atogepant | ORAL | Qulipta (NDA, AbbVie Inc., 2025-09-30) |
| atomoxetine | Atomoxetine | ORAL | Strattera (NDA, Eli Lilly and Company, 2026-06-30) |
| atorvastatin | atorvastatin | ORAL | Lipitor (NDA, Viatris Specialty LLC, 2024-04-15) |
| atovaquone | Atovaquone | ORAL | MEPRON (NDA, GlaxoSmithKline LLC, 2026-03-20) |
| atovaquone-proguanil | Atovaquone/proguanil | ORAL | MALARONE (NDA, GlaxoSmithKline LLC, 2026-06-10) |
| atracurium | atracurium besylate | INTRAVENOUS | Atracurium Besylate (ANDA, Meitheal Pharmaceuticals Inc., 2024-12-04) |
| atropine-sulphate | Atropine sulphate | ENDOTRACHEAL+INTRAMEDULLARY+INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAMUSCULAR; INTRAVASCULAR+INTRAVENOUS; INTRAVENOUS | Atropine Sulfate (NDA, Fresenius Kabi USA, LLC, 2024-10-11); ATROPEN Auto-Injector (NDA, Meridian Medical Technologies LLC, 2022-09-15); Atropine Sulfate (ANDA, Hikma Pharmaceuticals USA Inc., 2025-10-08); Atropine Sulfate (NDA, Hospira, Inc., 2026-05-18) |
| azathioprine | azathioprine | ORAL | IMURAN (NDA, Sebela Pharmaceuticals Inc., 2025-11-08) |
| azithromycin | azithromycin | ORAL | Zithromax (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-07-24) |
| aztreonam | aztreonam | INTRAMUSCULAR+INTRAVENOUS | AZACTAM (NDA, E.R. Squibb & Sons, L.L.C., 2025-12-15) |
| baclofen | Baclofen | INTRATHECAL; ORAL | Lioresal (baclofen) (NDA, Amneal Pharmaceuticals LLC, 2022-12-09); OZOBAX DS (NDA, Rosemont Pharmaceuticals LLC, 2026-03-13) |
| baloxavir | baloxavir marboxil | ORAL | Xofluza (NDA, Genentech, Inc., 2025-12-15) |
| baricitinib | baricitinib | ORAL | Olumiant (NDA, Eli Lilly and Company, 2026-06-30) |
| beclometasone | beclometasone (inhaled) | NASAL; RESPIRATORY (INHALATION) | QNASL (NDA, Teva Respiratory, LLC, 2022-09-27); Beclomethasone Dipropionate (ANDA, Amneal Pharmaceuticals NY LLC, 2020-07-31) |
| beclomethasone-inhaled | beclomethasone dipropionate (inhaled) | RESPIRATORY (INHALATION) | Beclomethasone Dipropionate (ANDA, Amneal Pharmaceuticals NY LLC, 2020-07-31) |
| belimumab | belimumab | SUBCUTANEOUS+INTRAVENOUS | BENLYSTA (BLA, GlaxoSmithKline LLC, 2026-08-21) |
| bempedoic-acid | bempedoic acid | ORAL | Nexletol (NDA, Esperion Therapeutics, Inc., 2026-06-25) |
| benralizumab | benralizumab | SUBCUTANEOUS | FASENRA (BLA, AstraZeneca Pharmaceuticals LP, 2026-05-13) |
| benzathine-penicillin | benzathine benzylpenicillin | INTRAMUSCULAR; INTRAMUSCULAR+INTRAPLEURAL+INTRATHECAL+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | BICILLIN L-A (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-07-21); Pfizerpen (ANDA, Roerig, 2025-12-16); Penicillin G Potassium (ANDA, WG Critical Care, LLC, 2026-06-24); PENICILLIN G POTASSIUM (NDA, Baxter Healthcare Corporation, 2026-07-24) |
| benznidazole | benznidazole | ORAL | Benznidazole (NDA, Exeltis USA, Inc., 2026-08-27) |
| benzylpenicillin | Benzylpenicillin (penicillin G) | INTRAMUSCULAR; INTRAMUSCULAR+INTRAPLEURAL+INTRATHECAL+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | BICILLIN L-A (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-07-21); Pfizerpen (ANDA, Roerig, 2025-12-16); Penicillin G Potassium (ANDA, WG Critical Care, LLC, 2026-06-24); PENICILLIN G POTASSIUM (NDA, Baxter Healthcare Corporation, 2026-07-24) |
| betamethasone-topical | betamethasone valerate (topical) | TOPICAL | Betamethasone Dipropionate (NDA, E. Fougera & Co. a division of Fougera Pharmaceuticals, LLC, 2026-08-21) |
| bevacizumab | bevacizumab | INTRAVASCULAR; INTRAVENOUS | JOBEVNE (BLA, Biocon Biologics Inc., 2026-03-11); Vegzelma (BLA, CELLTRION USA, Inc., 2026-08-21) |
| bicalutamide | bicalutamide | ORAL | Bicalutamide (NDA, Golden State Medical Supply, Inc., 2026-04-23) |
| bisoprolol | bisoprolol | ORAL | Bisoprolol (ANDA, Micro Labs Limited, 2026-03-11) |
| bleomycin | bleomycin | INTRAMUSCULAR+INTRAPLEURAL+INTRAVENOUS+SUBCUTANEOUS | Bleomycin (ANDA, Meitheal Pharmaceuticals Inc., 2026-04-17) |
| bosentan | bosentan | ORAL | Tracleer (NDA, Actelion Pharmaceuticals US, Inc., 2025-11-17) |
| brentuximab-vedotin | brentuximab vedotin | INTRAVENOUS | ADCETRIS (BLA, SEAGEN INC., 2025-11-11) |
| brexpiprazole | brexpiprazole | ORAL | Rexulti (NDA, Otsuka America Pharmaceutical, Inc., 2026-05-06) |
| brivaracetam | brivaracetam | ORAL; ORAL+INTRAVENOUS | brivaracetam (ANDA, Novadoz Pharmaceuticals LLC, 2026-08-14); Briviact (NDA, UCB, Inc., 2026-08-20) |
| brodalumab | brodalumab | SUBCUTANEOUS | Siliq (BLA, Bausch Health US LLC, 2026-05-28) |
| bromocriptine | bromocriptine | ORAL | Bromocriptine Mesylate (NDA, ANI Pharmaceuticals, Inc., 2026-07-27) |
| budesonide-inhaled | budesonide (inhaled) | RESPIRATORY (INHALATION) | PULMICORT FLEXHALER (NDA, Rubicon Holdings Inc., 2025-09-04) |
| bupivacaine | Bupivacaine | EPIDURAL+INFILTRATION; EPIDURAL+INFILTRATION+INTRACAUDAL+PERINEURAL; EPIDURAL+INFILTRATION+INTRACAUDAL+PERINEURAL+RETROBULBAR; EPIDURAL+INFILTRATION+RETROBULBAR; EPIDURAL+INTRACAUDAL+PERINEURAL; INFILTRATION; INFILTRATION+PERINEURAL; PERINEURAL | Bupivacaine Hydrochloride (ANDA, Fosun Pharma USA Inc., 2025-07-23); BUPIVACAINE HYDROCHLORIDE (ANDA, Hospira, Inc., 2026-04-14); BUPIVACAINE HYDROCHLORIDE (ANDA, NorthStar RxLLC, 2026-07-20); Bupivacaine Hydrochloride (ANDA, ONESOURCE SPECIALTY PHARMA LIMITED, 2025-11-28); Bupivacaine HCl (ANDA, Xellia Pharmaceuticals USA LLC, 2023-06-09); EXPAREL (NDA, Pacira Pharmaceuticals, Inc., 2025-12-12); bupivacaine hydrochloride (ANDA, Northstar Rx LLC, 2025-12-12); Bupivacaine HCl (ANDA, Xellia Pharmaceuticals USA LLC, 2023-06-09) |
| buprenorphine | buprenorphine (sublingual) | BUCCAL; SUBLINGUAL | BELBUCA (NDA, BioDelivery Sciences International Inc, 2026-01-02); buprenorphine hydrochloride (ANDA, Advagen Pharma Ltd, 2026-07-17) |
| buprenorphine-naloxone | Buprenorphine/naloxone | BUCCAL+SUBLINGUAL; SUBLINGUAL | Suboxone (NDA, INDIVIOR INC., 2025-12-22); Zubsolv (NDA, Edenbridge Pharmaceuticals LLC., 2026-06-12) |
| bupropion | Bupropion | ORAL | Bupropion Hydrobromide (NDA, Oceanside Pharmaceuticals, 2026-06-01) |
| buspirone | buspirone | ORAL | Buspirone hydrochloride (ANDA, AiPing Pharmaceutical, Inc., 2026-07-29) |
| cabotegravir-oral | cabotegravir (oral lead-in) | ORAL | Vocabria (NDA, ViiV Healthcare Company, 2025-04-11) |
| calcitonin-salmon | Calcitonin (salmon) | INTRAMUSCULAR+SUBCUTANEOUS | Miacalcin (NDA, Mylan Institutional LLC, 2024-09-15) |
| calcitriol | Calcitriol (1,25-dihydroxyvitamin D3) | ORAL | Calcitriol (NDA, ANI Pharmaceuticals, Inc., 2026-07-10) |
| calcium-gluconate | calcium gluconate | INTRAVENOUS | Calcium Gluconate (NDA, Fresenius Kabi USA, LLC, 2026-05-18) |
| canagliflozin | canagliflozin | ORAL | INVOKANA (NDA, Janssen Pharmaceuticals, Inc., 2026-06-11) |
| candesartan | candesartan cilexetil | ORAL | Candesartan cilexetil (NDA, ANI Pharmaceuticals, Inc., 2025-12-22) |
| cangrelor | cangrelor | INTRAVENOUS | KENGREAL (NDA, Chiesi USA, Inc., 2025-10-21) |
| capecitabine | capecitabine | ORAL | XELODA (NDA, H2-Pharma, LLC, 2026-02-05) |
| carbamazepine | carbamazepine | ORAL | Tegretol (NDA, Novartis Pharmaceuticals Corporation, 2026-08-20) |
| carboplatin | carboplatin | INTRAVENOUS | KYXATA (NDA, Avyxa Pharma, LLC, 2025-09-02) |
| carboprost | Carboprost (15-methyl PGF2α) | INTRAMUSCULAR | Hemabate (NDA, Pharmacia & Upjohn Company LLC, 2026-03-30) |
| cariprazine | cariprazine | ORAL | Vraylar (NDA, Allergan, Inc., 2025-12-18) |
| carvedilol | carvedilol | ORAL | Coreg (NDA, Waylis Therapeutics LLC, 2026-07-31) |
| cefaclor | cefaclor | ORAL | Cefaclor (ANDA, Carlsbad Technology, Inc., 2025-05-01) |
| cefalexin | cefalexin | ORAL | Cephalexin (ANDA, Lupin Pharmaceuticals, Inc., 2026-08-24) |
| cefepime | Cefepime | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | cefepime (ANDA, Sagent Pharmaceuticals, 2026-07-16); Cefepime (NDA, Baxter Healthcare Corporation, 2026-06-25) |
| cefiderocol | cefiderocol | INTRAVENOUS | Fetroja (NDA, Shionogi Inc., 2026-02-24) |
| ceftaroline | Ceftaroline fosamil | INTRAVENOUS | Teflaro (NDA, Allergan, Inc., 2024-11-20) |
| ceftazidime | ceftazidime | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | Ceftazidime (ANDA, Sagent Pharmaceuticals, 2026-08-03); Ceftazidime (ANDA, WG Critical Care, LLC, 2026-06-24) |
| ceftazidime-avibactam | ceftazidime/avibactam | INTRAVENOUS | AVYCAZ (NDA, Allergan, Inc., 2025-04-30) |
| ceftolozane-tazobactam | ceftolozane/tazobactam | INTRAVENOUS | ZERBAXA (NDA, Merck Sharp & Dohme LLC, 2026-05-12) |
| ceftriaxone | ceftriaxone | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | Ceftriaxone Sodium (ANDA, Qilu Pharmaceutical Co., Ltd., 2026-02-04); CEFTRIAXONE AND DEXTROSE (NDA, B. Braun Medical Inc., 2022-01-13) |
| celecoxib | celecoxib | ORAL | VYSCOXA (NDA, Carwin Pharmaceutical Associates, LLC, 2025-07-31) |
| cemiplimab | cemiplimab | INTRAVENOUS | LIBTAYO (BLA, Regeneron Pharmaceuticals, Inc., 2026-08-31) |
| cenobamate | cenobamate | ORAL | Xcopri (NDA, SK Life Science, Inc., 2025-08-25) |
| cephalexin | cephalexin | ORAL | Cephalexin (ANDA, Lupin Pharmaceuticals, Inc., 2026-08-24) |
| certolizumab | certolizumab pegol | SUBCUTANEOUS | Cimzia (BLA, UCB, Inc., 2026-02-24) |
| cetirizine | Cetirizine | ORAL | Zyrtec (NDA, Kenvue Brands LLC, 2026-04-27) |
| cetuximab | cetuximab | INTRAVENOUS | ERBITUX (BLA, ImClone LLC, 2026-04-16) |
| chloroquine | chloroquine | ORAL | Chloroquine Phosphate (ANDA, Rising Pharma Holdings, Inc., 2026-07-02) |
| chlorphenamine | chlorphenamine | ORAL | Chlorphen-12 (ANDA, KVK-Tech, Inc., 2018-12-19) |
| chlorpromazine | chlorpromazine | INTRAMUSCULAR; ORAL | Chlorpromazine Hydrochloride (ANDA, Novadoz Pharmaceuticals LLC, 2026-02-02); Chlorpromazine hydrochloride (ANDA, Northstar Rx LLC, 2026-08-26) |
| ciclosporin | ciclosporin | INTRAVENOUS+ORAL; ORAL | Sandimmune (NDA, Novartis Pharmaceuticals Corporation, 2026-07-10); Neoral (NDA, Novartis Pharmaceuticals Corporation, 2026-08-10) |
| cilostazol | cilostazol | ORAL | cilostazol (ANDA, Apotex Corp., 2026-09-10) |
| cimetidine | cimetidine | ORAL | Tagamet (NDA, Medtech Products Inc., 2024-06-10) |
| cinacalcet | Cinacalcet | ORAL | Sensipar (NDA, Amgen Inc, 2025-12-07) |
| ciprofloxacin | ciprofloxacin | ORAL | Cipro (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-03-02) |
| cisplatin | Cisplatin | INTRAVENOUS | Cisplatin (NDA, WG Critical Care, LLC, 2026-06-24) |
| cisplatin-detail | cisplatin | INTRAVENOUS | Cisplatin (NDA, WG Critical Care, LLC, 2026-06-24) |
| citalopram | Citalopram | ORAL | citalopram (NDA, Almatica Pharma LLC, 2025-10-07) |
| cladribine-tablets | cladribine (oral) | ORAL | Mavenclad (NDA, EMD Serono, Inc., 2026-05-27) |
| clarithromycin | clarithromycin | ORAL | Clarithromycin (ANDA, Solaris Pharma Corporation, 2026-04-09) |
| clindamycin | Clindamycin | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS; ORAL | Cleocin Phosphate (NDA, Pharmacia & Upjohn Company LLC, 2026-07-29); clindamycin phosphate (NDA, Baxter Healthcare Company, 2026-04-28); Clindamycin hydrochloride (ANDA, Sun Pharmaceutical Industries, Inc., 2026-06-19) |
| clofazimine | Clofazimine | ORAL | Lamprene (NDA, Novartis Pharmaceuticals Corporation, 2026-08-17) |
| clomipramine | clomipramine | ORAL | ANAFRANIL (NDA, SpecGx LLC, 2024-11-26) |
| clonidine | clonidine | ORAL | QLONILIK (NDA, CMP Pharma, Inc., 2026-08-12) |
| clopidogrel | clopidogrel | ORAL | Plavix (NDA, Sanofi-Aventis U.S. LLC, 2025-05-30) |
| clotrimazole | clotrimazole | TOPICAL; VAGINAL | CLOTRIMAZOLE (ANDA, AARNA USA INC, 2026-02-27); Clotrimazole (NDA, Foster and Thrive (Mckesson /STRATEGIC SOURCING SERVICES LLC), 2025-07-30) |
| clotrimazole-topical | clotrimazole (topical 1 %) | TOPICAL | CLOTRIMAZOLE (ANDA, AARNA USA INC, 2026-02-27) |
| clozapine | Clozapine | ORAL | VERSACLOZ (NDA, TruPharma LLC, 2026-09-06) |
| co-amoxiclav | amoxicillin + clavulanic acid | ORAL | AUGMENTIN ES-600 (NDA, USAntibiotics, LLC, 2026-07-07) |
| co-trimoxazole | sulfamethoxazole + trimethoprim | INTRAVENOUS; ORAL | Sulfamethoxazole and Trimethoprim (ANDA, Somerset Therapeutics, LLC, 2025-07-16); SULFATRIM (NDA, PAI Holdings, LLC dba PAI Pharma, 2025-03-06) |
| co-trimoxazole-pjp | co-trimoxazole (PJP prophylaxis dose) | INTRAVENOUS; ORAL | Sulfamethoxazole and Trimethoprim (ANDA, Somerset Therapeutics, LLC, 2025-07-16); SULFATRIM (NDA, PAI Holdings, LLC dba PAI Pharma, 2025-03-06) |
| codeine | codeine phosphate | ORAL | Codeine sulfate (NDA, Hikma Pharmaceuticals USA Inc., 2025-12-22) |
| colchicine | Colchicine | ORAL | Gloperba (NDA, Scilex Pharmaceuticals Inc., 2024-11-01) |
| crizotinib | crizotinib | ORAL | Xalkori (NDA, Pfizer Laboratories Div Pfizer Inc, 2025-07-22) |
| cyclopentolate | Cyclopentolate (ophthalmic) | OPHTHALMIC | Cyclogyl (ANDA, Alcon Laboratories, Inc., 2024-06-25) |
| cyclophosphamide | Cyclophosphamide | INTRAVENOUS; INTRAVENOUS+ORAL | Frindovyx (NDA, AVYXA Pharma, LLC, 2026-08-26); Cyclophosphamide (ANDA, BluePoint Laboratories, 2026-03-12) |
| cyclophosphamide-detail | cyclophosphamide | INTRAVENOUS; INTRAVENOUS+ORAL | Frindovyx (NDA, AVYXA Pharma, LLC, 2026-08-26); Cyclophosphamide (ANDA, BluePoint Laboratories, 2026-03-12) |
| cyclosporine | cyclosporine | INTRAVENOUS+ORAL; OPHTHALMIC; OPHTHALMIC+TOPICAL; ORAL | Sandimmune (NDA, Novartis Pharmaceuticals Corporation, 2026-07-10); Restasis MultiDose (NDA, Allergan, Inc., 2025-08-21); CEQUA (NDA, Sun Pharmaceutical Industries, Inc., 2026-06-15); Neoral (NDA, Novartis Pharmaceuticals Corporation, 2026-08-10) |
| dabigatran | dabigatran etexilate | ORAL | Pradaxa (NDA, Boehringer Ingelheim Pharmaceuticals, Inc., 2025-06-27) |
| dabrafenib | dabrafenib | ORAL | Tafinlar (NDA, Novartis Pharmaceuticals Corporation, 2026-05-20) |
| dalbavancin | dalbavancin | INTRAVENOUS | DALVANCE (NDA, Allergan, Inc., 2025-01-13) |
| dalteparin | dalteparin | SUBCUTANEOUS | Fragmin (NDA, Pfizer Laboratories Div Pfizer Inc, 2025-09-30) |
| dantrolene | Dantrolene sodium | INTRAVENOUS | Dantrium (NDA, Par Health USA, LLC, 2026-03-10) |
| dapagliflozin | dapagliflozin | ORAL | DAPAGLIFLOZIN (NDA, Prasco Laboratories, 2026-06-03) |
| daptomycin | Daptomycin | INTRAVENOUS | Daptomycin (NDA, Sagent Pharmaceuticals, 2026-08-06) |
| daratumumab | daratumumab | INTRAVENOUS | DARZALEX (BLA, Janssen Biotech, Inc., 2026-09-08) |
| darbepoetin | darbepoetin alfa | INTRAVENOUS+SUBCUTANEOUS | ARANESP (BLA, Amgen, Inc, 2026-07-07) |
| darolutamide | darolutamide | ORAL | NUBEQA (NDA, Bayer HealthCare Pharmaceuticals Inc., 2025-06-03) |
| darunavir | darunavir | ORAL | PREZISTA (NDA, Janssen Products LP, 2025-08-29) |
| darunavir-cobicistat | darunavir + cobicistat | ORAL | PREZCOBIX (NDA, Janssen Products, LP, 2026-02-01) |
| dasatinib | dasatinib | ORAL | SPRYCEL (NDA, E.R. Squibb & Sons, L.L.C., 2026-08-21) |
| daunorubicin | daunorubicin | INTRAVENOUS | Daunorubicin Hydrochloride (NDA, Hikma Pharmaceuticals USA Inc., 2024-02-15) |
| denosumab | Denosumab | SUBCUTANEOUS | Bilprevda (BLA, Organon LLC, 2026-08-18) |
| denosumab-detail | denosumab | SUBCUTANEOUS | Bilprevda (BLA, Organon LLC, 2026-08-18) |
| desipramine | desipramine | ORAL | Norpramin (NDA, Validus Pharmaceuticals LLC, 2025-07-03) |
| desmopressin | desmopressin (DDAVP) | NASAL; ORAL | Stimate (NDA, Ferring Pharmaceuticals Inc., 2026-07-22); Desmopressin Acetate (NDA, Nordic Pharma, Inc., 2024-12-06) |
| deutetrabenazine | deutetrabenazine | ORAL | Austedo (NDA, Teva Neuroscience, Inc., 2025-02-28) |
| dexamethasone | dexamethasone | INTRA-ARTICULAR+INTRALESIONAL+INTRAMUSCULAR+INTRAVENOUS+SOFT TISSUE; INTRAMUSCULAR+INTRAVENOUS; ORAL | Dexamethasone Sodium Phosphate (ANDA, Sagent Pharmaceuticals, 2026-08-06); Dexamethasone sodium phosphate (ANDA, Micro Labs Limited, 2026-08-26); Hemady (NDA, Edenbridge Pharmaceuticals LLC., 2026-01-09) |
| dexmedetomidine | dexmedetomidine | INTRAVENOUS | Precedex (NDA, Hospira, Inc., 2026-06-17) |
| dextrose-10 | glucose 10 % (dextrose 10 %) | INTRAVENOUS | Dextrose (NDA, Hospira, Inc., 2026-07-13) |
| diazepam | diazepam | INTRAMUSCULAR; INTRAMUSCULAR+INTRAVENOUS; RECTAL | Diazepam (NDA, Meridian Medical Technologies LLC, 2023-12-18); Diazepam (ANDA, Civica, Inc., 2026-08-19); Diazepam (NDA, Oceanside Pharmaceuticals, 2024-01-04) |
| diclofenac | diclofenac | ORAL; TOPICAL | ZIPSOR (NDA, Assertio Specialty Pharmaceuticals LLC, 2026-03-01); LICART (NDA, IBSA Pharma Inc., 2026-04-02) |
| digoxin | digoxin | ORAL | Digoxin (NDA, Hikma Pharmaceuticals USA Inc., 2025-04-10) |
| diltiazem | diltiazem | INTRAVENOUS; ORAL | DILTIAZEM HYDROCHLORIDE in SODIUM CHLORIDE (NDA, WG Critical Care, LLC, 2025-04-15); TIAZAC EXTENDED RELEASE (NDA, Bausch Health US, LLC, 2026-08-07) |
| dimethyl-fumarate | dimethyl fumarate | ORAL | TECFIDERA (NDA, Biogen Inc., 2025-06-04) |
| dimeticone-ntd-topical | Dimeticone (two-oil formulation) | CUTANEOUS; TOPICAL | Arme Scar Gel (other, Nanjing Ludejin Corporation Management Co., Ltd, 2025-11-06); La Roche Posay Laboratoire Dermatologique Cicaplast Balm B5 Soothing Therapeutic Multipurpose (other, L'Oreal USA Products Inc, 2026-09-10) |
| diphenhydramine | Diphenhydramine | INTRAMUSCULAR+INTRAVENOUS; ORAL | DIPHENHYDRAMINE (ANDA, Micro Labs Limited, 2026-03-05); Diphenhydramine HCL (ANDA, Redmont Pharmaceuticals, LLC, 2026-08-03) |
| disulfiram | Disulfiram | ORAL | Disulfiram (ANDA, Alvogen Inc., 2025-10-07) |
| dobutamine | Dobutamine | INTRAVENOUS | Dobutamine Hydrochloride in Dextrose (NDA, Baxter Healthcare Corporation, 2023-09-08) |
| docetaxel | docetaxel | INTRAVENOUS | BEIZRAY (NDA, Zydus Pharmaceuticals USA Inc., 2025-12-17) |
| dofetilide | dofetilide | ORAL | Tikosyn (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-04-21) |
| dolutegravir | dolutegravir | ORAL | Tivicay (NDA, ViiV Healthcare Company, 2026-08-25) |
| dolutegravir-abacavir-lamivudine | dolutegravir + abacavir + lamivudine | ORAL | Triumeq (NDA, ViiV Healthcare Company, 2024-07-08) |
| dolutegravir-lamivudine | dolutegravir + lamivudine | ORAL | Dovato (NDA, ViiV Healthcare Company, 2025-10-29) |
| dolutegravir-rilpivirine | dolutegravir + rilpivirine | ORAL | Juluca (NDA, ViiV Healthcare Company, 2025-10-29) |
| donepezil | Donepezil | ORAL | Aricept (NDA, Eisai Inc., 2021-12-30) |
| doravirine-detail | doravirine | ORAL | PIFELTRO (NDA, Merck Sharp & Dohme LLC, 2026-07-08) |
| dornase-alfa | dornase alfa | RESPIRATORY (INHALATION) | Pulmozyme (BLA, Genentech, Inc., 2025-12-17) |
| dostarlimab | dostarlimab | INTRAVENOUS | Jemperli (BLA, GlaxoSmithKline LLC, 2025-09-02) |
| doxepin | doxepin | ORAL | Silenor (NDA, Currax Pharmaceuticals LLC, 2026-04-21) |
| doxorubicin | Doxorubicin | INTRAVENOUS; INTRAVENOUS+INTRAVITREAL | Doxorubicin Hydrochloride (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-05-05); DOXIL (NDA, Baxter Healthcare Company, 2022-05-31) |
| doxorubicin-detail | doxorubicin | INTRAVENOUS; INTRAVENOUS+INTRAVITREAL | Doxorubicin Hydrochloride (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-05-05); DOXIL (NDA, Baxter Healthcare Company, 2022-05-31) |
| doxycycline | doxycycline | ORAL | Doxycycline (NDA, Wellhouse Pharma, LLC, 2026-07-24) |
| doxylamine-pyridoxine | Doxylamine/pyridoxine | ORAL | Doxylamine succinate and pyridoxine hydrochloride (NDA, Analog Pharma, 2025-12-03) |
| dronedarone | dronedarone | ORAL | Multaq (NDA, Sanofi-Aventis U.S. LLC, 2025-05-29) |
| dulaglutide | dulaglutide | SUBCUTANEOUS | Trulicity (BLA, Eli Lilly and Company, 2026-06-16) |
| duloxetine | duloxetine | ORAL | Duloxetine (NDA, Almatica Pharma LLC, 2026-03-02) |
| dupilumab | Dupilumab | SUBCUTANEOUS | Dupixent (BLA, Sanofi-Aventis U.S. LLC, 2026-04-22) |
| dupilumab-detail | dupilumab | SUBCUTANEOUS | Dupixent (BLA, Sanofi-Aventis U.S. LLC, 2026-04-22) |
| durvalumab | durvalumab | INTRAVENOUS | IMFINZI (BLA, AstraZeneca Pharmaceuticals LP, 2026-08-31) |
| dutasteride | Dutasteride | ORAL | Dutasteride (ANDA, Strides Pharma Science Limited, 2026-08-27) |
| dutasteride-detail | dutasteride | ORAL | Dutasteride (ANDA, Strides Pharma Science Limited, 2026-08-27) |
| edaravone | edaravone | INTRAVENOUS | edaravone (ANDA, XGen Pharmaceuticals DJB, Inc., 2026-05-28) |
| edoxaban | edoxaban | ORAL | SAVAYSA (NDA, Daiichi Sankyo Inc., 2025-07-10) |
| efavirenz | Efavirenz | ORAL | Efavirenz (ANDA, Macleods Pharmaceuticals Limited, 2024-06-28) |
| eliglustat | eliglustat | ORAL | Cerdelga (NDA, Genzyme Corporation, 2024-03-03) |
| eltrombopag | eltrombopag | ORAL | ALVAIZ (NDA, Teva Pharmaceuticals, Inc., 2026-01-01) |
| empagliflozin | empagliflozin | ORAL | Jardiance (NDA, Boehringer Ingelheim Pharmaceuticals, Inc., 2026-01-30) |
| emtricitabine | Emtricitabine | ORAL | Emtriva (NDA, Gilead Sciences, Inc., 2025-12-02) |
| enalapril | enalapril | ORAL | Vasotec (NDA, Bausch Health US LLC, 2026-01-23) |
| enoxaparin | enoxaparin (low-molecular-weight heparin) | SUBCUTANEOUS; SUBCUTANEOUS+INTRAVENOUS | Enoxaparin sodium (NDA, Sanofi-Aventis U.S. LLC, 2026-02-06); Lovenox (NDA, Sanofi-Aventis U.S. LLC, 2026-05-28) |
| entecavir | Entecavir | ORAL | BARACLUDE (NDA, E.R. Squibb & Sons, L.L.C., 2019-11-06) |
| entecavir-detail | entecavir | ORAL | BARACLUDE (NDA, E.R. Squibb & Sons, L.L.C., 2019-11-06) |
| enzalutamide | enzalutamide | ORAL | Xtandi (NDA, Astellas Pharma US, Inc., 2026-07-28) |
| ephedrine | Ephedrine | INTRAVENOUS | Ephedrine Sulfate (NDA, Par Health USA, LLC, 2026-03-17) |
| epoetin-alfa | Epoetin alfa (recombinant erythropoietin) | INTRAVENOUS+SUBCUTANEOUS | EPOGEN (BLA, Amgen, Inc, 2026-06-23) |
| epoprostenol | epoprostenol | INTRAVENOUS | Veletri (NDA, Actelion Pharmaceuticals US, Inc., 2022-11-28) |
| eptinezumab | eptinezumab | INTRAVENOUS | Vyepti (BLA, Lundbeck Pharmaceuticals LLC, 2026-06-05) |
| eravacycline | eravacycline | INTRAVENOUS | Xerava (NDA, Tetraphase Pharmaceuticals, Inc., 2025-03-31) |
| erenumab | erenumab | SUBCUTANEOUS | AIMOVIG (BLA, Amgen, Inc, 2026-07-14) |
| ergotamine | ergotamine | ORAL | Ergomar Sublingual (ANDA, Pangea Pharmaceuticals LLC, 2025-02-25) |
| erlotinib | erlotinib | ORAL | Erlotinib (ANDA, Zydus Lifesciences Limited, 2024-11-28) |
| ertapenem | Ertapenem | INTRAMUSCULAR+INTRAVENOUS | ERTAPENEM (NDA, ENDO USA, Inc., 2026-03-02) |
| ertugliflozin | ertugliflozin | ORAL | STEGLATRO (NDA, Merck Sharp & Dohme LLC, 2026-06-03) |
| erythromycin | erythromycin | INTRAVENOUS; ORAL | Erythrocin Lactobionate (NDA, Hospira, Inc., 2025-10-30); erythromycin (NDA, Dr. Reddy's Labratories Inc., 2025-09-25) |
| escitalopram | escitalopram | ORAL | escitalopram (NDA, Almatica Pharma LLC, 2025-08-31) |
| esketamine-nasal | esketamine (intranasal) | NASAL | Spravato (NDA, Janssen Pharmaceuticals, Inc., 2026-03-31) |
| esomeprazole | esomeprazole | ORAL | NEXIUM (NDA, AstraZeneca Pharmaceuticals LP, 2025-12-19) |
| estradiol-hrt | estradiol (HRT) | ORAL; TOPICAL; TRANSDERMAL | Estradiol (ANDA, NorthStar Rx LLC, 2025-11-11); Estradiol (NDA, Trigen Laboratories, LLC, 2026-08-21); Minivelle (NDA, Noven Therapeutics, LLC, 2026-07-31) |
| etanercept | etanercept | SUBCUTANEOUS | ENBREL (BLA, Immunex Corporation, 2026-05-11) |
| ethambutol | ethambutol | ORAL | Ethambutol Hydrochloride (NDA, STI Pharma LLC, 2026-05-05) |
| etomidate | etomidate | INTRAVENOUS | Amidate (NDA, Hospira, Inc., 2026-05-20) |
| etoposide | etoposide | INTRAVENOUS; ORAL | ETOPOPHOS (NDA, H2-Pharma, LLC, 2026-07-31); ETOPOSIDE (NDA, Onesource Specialty Pharma Limited, 2026-07-23) |
| etravirine | etravirine | ORAL | Etravirine (NDA, Patriot Pharmaceuticals, 2025-04-02) |
| everolimus | everolimus | ORAL | Afinitor (NDA, Novartis Pharmaceuticals Corporation, 2026-06-01) |
| evolocumab | Evolocumab | SUBCUTANEOUS | REPATHA (BLA, Amgen USA Inc., 2026-08-19) |
| evolocumab-detail | evolocumab | SUBCUTANEOUS | REPATHA (BLA, Amgen USA Inc., 2026-08-19) |
| exemestane | exemestane | ORAL | EXEMESTANE (NDA, Mylan Pharmaceuticals Inc., 2025-12-24) |
| exenatide-extended | exenatide | SUBCUTANEOUS | Byetta (NDA, AstraZeneca Pharmaceuticals LP, 2025-09-02) |
| ezetimibe | ezetimibe | ORAL | Zetia (NDA, Organon LLC, 2025-11-25) |
| ezetimibe-detail | ezetimibe | ORAL | Zetia (NDA, Organon LLC, 2025-11-25) |
| famotidine | Famotidine | ORAL | Pepcid AC Original Strength (NDA, Kenvue Brands LLC, 2026-02-06) |
| febuxostat | febuxostat | ORAL | ULORIC (NDA, Takeda Pharmaceuticals America, Inc., 2025-12-24) |
| fenofibrate | Fenofibrate | ORAL | Fenofibrate (NDA, ANI Pharmaceuticals, Inc., 2026-05-12) |
| fentanyl | fentanyl | INTRAMUSCULAR+INTRAVENOUS; TRANSDERMAL | Fentanyl Citrate (NDA, Hospira, Inc., 2026-08-24); FENTANYL (ANDA, Aveva Drug Delivery Systems Inc., 2026-04-07) |
| ferric-carboxymaltose | ferric carboxymaltose (intravenous iron) | INTRAVENOUS | Injectafer (NDA, American Regent, Inc., 2026-08-19) |
| fexinidazole | Fexinidazole | ORAL | Fexinidazole (NDA, Sanofi-Aventis U.S. LLC, 2025-05-02) |
| filgrastim | Filgrastim (recombinant G-CSF) | INTRAVENOUS+SUBCUTANEOUS; SUBCUTANEOUS | NEUPOGEN (BLA, Amgen, Inc, 2026-07-23); GRANIX (BLA, Cephalon, LLC, 2023-11-30) |
| finasteride | finasteride | ORAL | PROSCAR (NDA, Organon LLC, 2026-03-18) |
| finasteride-5mg | finasteride 5 mg | ORAL | PROSCAR (NDA, Organon LLC, 2026-03-18) |
| fingolimod | fingolimod | ORAL | TASCENSO ODT (NDA, Cycle Pharmaceuticals Ltd, 2026-01-20) |
| fluconazole | fluconazole | INTRAVENOUS; ORAL | Fluconazole (ANDA, Hospira, Inc, 2024-12-05); Fluconazole (NDA, Mylan Pharmaceuticals Inc., 2026-04-02) |
| flucytosine | Flucytosine | ORAL | ANCOBON (NDA, Bausch Health US LLC, 2022-02-02) |
| fludrocortisone | fludrocortisone | ORAL | fludrocortisone acetate (ANDA, Eywa Pharma Inc, 2026-05-13) |
| flumazenil | Flumazenil | INTRAVENOUS | Flumazenil (ANDA, Fresenius Kabi USA, LLC, 2025-03-27) |
| fluorouracil | 5-fluorouracil | INTRAVENOUS | FAVLYXA (NDA, Avyxa Pharma, LLC, 2026-07-23) |
| fluoxetine | fluoxetine | ORAL | Prozac (NDA, Dista Products Company, 2026-01-08) |
| fluphenazine-decanoate | fluphenazine decanoate | INTRAMUSCULAR; INTRAMUSCULAR+SUBCUTANEOUS | Fluphenazine Hydrochloride (ANDA, Fresenius Kabi USA, LLC, 2024-10-14); Fluphenazine Decanoate (ANDA, Par Health USA, LLC, 2026-08-25) |
| fluticasone | fluticasone (inhaled) | NASAL; RESPIRATORY (INHALATION); TOPICAL | XHANCE (NDA, Paratek Pharmaceuticals, Inc., 2026-05-19); Fluticasone Furoate Ellipta (NDA, Prasco Laboratories, 2025-03-06); Fluticasone Propionate (ANDA, Encube Ethicals, Inc., 2025-10-27) |
| fluvoxamine | fluvoxamine | ORAL | fluvoxamine maleate (NDA, ANI Pharmaceuticals, Inc., 2025-08-04) |
| folic-acid | folic acid | ORAL | FOLIC ACID (NDA, Ayurax, LLC, 2026-02-11) |
| fomepizole | Fomepizole | INTRAVENOUS | Fomepizole (ANDA, Zydus Pharmaceuticals USA Inc., 2025-11-20) |
| fondaparinux | Fondaparinux | SUBCUTANEOUS | Fondaparinux Sodium (NDA, Mylan Institutional LLC, 2024-12-15) |
| fosaprepitant | fosaprepitant | INTRAVENOUS | NAVITRUX (NDA, AVYXA Pharma, LLC, 2026-07-29) |
| fremanezumab | fremanezumab | SUBCUTANEOUS | AJOVY (BLA, Teva Pharmaceuticals USA, Inc., 2026-06-05) |
| fulvestrant | fulvestrant | INTRAMUSCULAR; INTRAVENOUS | CLIGAVYX (NDA, Avyxa Pharma, LLC, 2026-06-24); Fulvestrant (ANDA, Eugia US LLC, 2025-07-03) |
| furosemide | furosemide | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS; ORAL; SUBCUTANEOUS | Furosemide (NDA, Hospira, Inc., 2026-05-13); Furosemide (ANDA, Heritage Pharmaceuticals Inc. d/b/a Avet Pharmaceuticals Inc., 2026-03-18); Furosemide (NDA, Granulation Technology, Inc., 2026-06-17); FUROSCIX (NDA, scPharmaceuticals Inc., a wholly owned subsidiary of MannKind Corporation, 2026-07-31) |
| gabapentin | gabapentin | ORAL | Gralise (NDA, Almatica Pharma LLC, 2026-06-30) |
| galantamine | Galantamine | ORAL | Galantamine (ANDA, Upsher-Smith Laboratories, LLC, 2026-06-01) |
| galantamine-detail | galantamine | ORAL | Galantamine (ANDA, Upsher-Smith Laboratories, LLC, 2026-06-01) |
| galcanezumab | galcanezumab | SUBCUTANEOUS | EMGALITY (BLA, Eli Lilly and Company, 2026-06-05) |
| ganciclovir-iv | Ganciclovir (intravenous) | INTRAVENOUS | Ganciclovir (ANDA, Fresenius Kabi USA, LLC, 2026-01-09) |
| gefitinib | gefitinib | ORAL | IRESSA (NDA, AstraZeneca Pharmaceuticals LP, 2023-02-28) |
| gemcitabine | gemcitabine | INTRAVENOUS | AVGEMSI (NDA, Avyxa Pharma, LLC, 2026-07-27) |
| gentamicin | gentamicin | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | Gentamicin Sulfate (ANDA, Hospira, Inc., 2026-05-20); Gentamicin Sulfate in Sodium Chloride (ANDA, Baxter Healthcare Corporation, 2023-01-26) |
| glecaprevir-pibrentasvir | glecaprevir + pibrentasvir | ORAL | Mavyret (NDA, AbbVie Inc., 2025-06-25) |
| glibenclamide | glibenclamide (glyburide) | ORAL | Glyburide (NDA, TEVA Pharmaceuticals USA Inc, 2021-07-01) |
| glimepiride | glimepiride | ORAL | Glimepiride (ANDA, Aurobindo Pharma Limited, 2026-03-18) |
| glucagon | Glucagon | INTRAMUSCULAR+INTRAVENOUS | Glucagon (NDA, Fresenius Kabi USA, LLC, 2022-04-01) |
| glucose-50 | glucose 50 % (dextrose 50 %) | INTRAVENOUS | Dextrose (NDA, Hospira, Inc., 2026-07-13) |
| glyceryl-trinitrate | glyceryl trinitrate (nitroglycerin) | INTRAVENOUS; ORAL; SUBLINGUAL | Nitroglycerin In Dextrose (NDA, Baxter Healthcare Company, 2016-08-22); NITROGLYCERIN LINGUAL (NDA, Allegis Pharmaceuticals, LLC, 2025-12-17); NITROGLYCERIN (NDA, Mylan Pharmaceuticals Inc., 2024-10-15) |
| golimumab | golimumab | INTRAVENOUS; SUBCUTANEOUS | SIMPONI ARIA (BLA, Janssen Biotech, Inc., 2025-09-09); Simponi (BLA, Janssen Biotech, Inc., 2025-10-29) |
| goserelin | goserelin | SUBCUTANEOUS | ZOLADEX (NDA, TerSera Therapeutics LLC, 2026-03-24) |
| granisetron | granisetron | INTRAVENOUS; SUBCUTANEOUS | Granisetron Hydrochloride (ANDA, Eugia US LLC, 2025-04-24); SUSTOL (NDA, Heron Therapeutics, Inc., 2026-04-30) |
| griseofulvin | griseofulvin | ORAL | Ultramicrosize Griseofulvin (ANDA, Chartwell RX, LLC., 2025-12-10) |
| gtn | glyceryl trinitrate | INTRAVENOUS | Nitroglycerin In Dextrose (NDA, Baxter Healthcare Company, 2016-08-22) |
| guselkumab | guselkumab | SUBCUTANEOUS+INTRAVENOUS | TREMFYA (BLA, Janssen Biotech, Inc., 2026-06-04) |
| haloperidol | haloperidol | INTRAMUSCULAR; ORAL | Haldol Decanoate (NDA, Janssen Pharmaceuticals, Inc., 2025-11-11); Haloperidol (ANDA, Upsher-Smith Laboratories, LLC, 2026-08-05) |
| haloperidol-decanoate | Haloperidol decanoate (long-acting injectable) | INTRAMUSCULAR | Haldol Decanoate (NDA, Janssen Pharmaceuticals, Inc., 2025-11-11) |
| heparin | unfractionated heparin (UFH) | INTRAVENOUS; INTRAVENOUS+SUBCUTANEOUS | Heparin Sodium and Dextrose (NDA, Hospira, Inc., 2026-05-25); Heparin Sodium (NDA, Fresenius Kabi USA, LLC, 2026-04-30) |
| hydralazine | hydralazine | INTRAMUSCULAR+INTRAVENOUS; ORAL | Hydralazine Hydrochloride (ANDA, Zydus Pharmaceuticals USA Inc., 2026-05-06); Hydralazine Hydrochloride (ANDA, Heritage Pharmaceuticals Inc. d/b/a Avet Pharmaceuticals Inc., 2026-04-03) |
| hydrochlorothiazide | hydrochlorothiazide | ORAL | INZIRQO (NDA, ANI Pharmaceuticals, Inc., 2025-12-16) |
| hydrocortisone | hydrocortisone (cortisol) | INTRAMUSCULAR+INTRAVENOUS | Solu-Cortef (NDA, Pharmacia & Upjohn Company LLC, 2026-08-27) |
| hydromorphone | hydromorphone | INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; ORAL | Dilaudid (NDA, Fresenius Kabi USA, LLC, 2026-07-15); Hydromorphone Hydrochloride (NDA, Rhodes Pharmaceuticals LLC, 2026-05-14) |
| hydroxychloroquine | hydroxychloroquine | ORAL | Plaquenil (NDA, Advanz Pharma (US) Corp., 2026-04-09) |
| hydroxyurea | hydroxycarbamide (hydroxyurea) | ORAL | XROMI (NDA, Nova Laboratories, Ltd., 2026-02-02) |
| hydroxyurea-paediatric-scd | Hydroxyurea (hydroxycarbamide) | ORAL | XROMI (NDA, Nova Laboratories, Ltd., 2026-02-02) |
| ibrutinib | ibrutinib | ORAL | Imbruvica (NDA, Pharmacyclics LLC, 2025-10-21) |
| ibuprofen | ibuprofen | ORAL | Advil (NDA, Haleon US Holdings LLC, 2026-07-29) |
| ibutilide | ibutilide | INTRAVENOUS | Corvert (NDA, Pharmacia & Upjohn Company LLC, 2024-01-25) |
| icosapent-ethyl | icosapent ethyl | ORAL | Vascepa (NDA, Amarin Pharma Inc., 2026-03-23) |
| idarubicin | idarubicin | INTRAVENOUS | Idamycin PFS (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-04-15) |
| idarucizumab | Idarucizumab | INTRAVENOUS | Praxbind (BLA, Boehringer Ingelheim Pharmaceuticals, Inc., 2024-01-23) |
| ifosfamide | ifosfamide | INTRAVENOUS | IFOSFAMIDE (NDA, Baxter Healthcare Company, 2024-12-02) |
| imatinib | Imatinib | ORAL | Gleevec (NDA, Novartis Pharmaceuticals Corporation, 2026-07-13) |
| imatinib-detail | imatinib | ORAL | Gleevec (NDA, Novartis Pharmaceuticals Corporation, 2026-07-13) |
| imipenem-relebactam | imipenem/cilastatin/relebactam | INTRAVENOUS | RECARBRIO (NDA, Merck Sharp & Dohme LLC, 2025-12-09) |
| inclisiran | inclisiran | SUBCUTANEOUS | LEQVIO (NDA, Novartis Pharmaceuticals Corporation, 2026-08-19) |
| indapamide | indapamide | ORAL | Indapamide (ANDA, ANI Pharmaceuticals, Inc., 2025-09-12) |
| indomethacin-tocolytic | indomethacin (tocolytic indication) | ORAL; RECTAL | INDOMETHACIN (NDA, Chartwell RX, LLC, 2025-03-26); Indomethacin (ANDA, NorthStar RxLLC, 2025-12-19) |
| insulin-aspart | insulin aspart | INTRAVENOUS+SUBCUTANEOUS | MERILOG (BLA, Sanofi-Aventis U.S. LLC, 2025-10-07) |
| insulin-aspart-faster | insulin aspart (faster-acting) | INTRAVENOUS+SUBCUTANEOUS | MERILOG (BLA, Sanofi-Aventis U.S. LLC, 2025-10-07) |
| insulin-degludec-detail | insulin degludec | SUBCUTANEOUS | Tresiba (BLA, Novo Nordisk, 2022-07-01) |
| insulin-glargine | insulin glargine | SUBCUTANEOUS | BASAGLAR KwikPen (BLA, Eli Lilly and Company, 2026-06-16) |
| insulin-lispro-faster | insulin lispro (ultra-rapid) | SUBCUTANEOUS; SUBCUTANEOUS+INTRAVENOUS | Humalog Mix50/50 KwikPen (BLA, Eli Lilly and Company, 2026-07-27); LYUMJEV (BLA, Eli Lilly and Company, 2026-06-16) |
| iohexol | iohexol | INTRAVASCULAR+INTRAVENOUS+INTRATHECAL+ORAL+RECTAL+INTRA-ARTICULAR; INTRAVENOUS | OMNIPAQUE (NDA, GE Healthcare Inc., 2026-04-07); Omnipaque (NDA, GE Healthcare, 2026-04-07) |
| ipilimumab | ipilimumab | INTRAVENOUS | YERVOY (BLA, E.R. Squibb & Sons, L.L.C., 2026-08-20) |
| irinotecan | irinotecan | INTRAVENOUS | Camptosar (NDA, Pharmacia & Upjohn Company LLC, 2026-05-12) |
| iron-sucrose | iron sucrose | INTRAVENOUS; INTRAVENOUS+INTRAVITREAL | Venofer (NDA, American Regent, Inc., 2026-03-01); Iron Sucrose (ANDA, Sandoz Inc, 2025-06-30) |
| isoniazid | isoniazid | ORAL | Isoniazid (ANDA, Chartwell RX, LLC, 2025-12-02) |
| isotretinoin | Isotretinoin | ORAL | Absorica LD (NDA, Sun Pharmaceutical Industries, Inc., 2026-08-19) |
| itraconazole | Itraconazole | ORAL | SPORANOX (NDA, Janssen Pharmaceuticals, Inc., 2026-07-13) |
| ivabradine | ivabradine | ORAL | Corlanor (NDA, Amgen Inc, 2025-11-10) |
| ivacaftor | ivacaftor | ORAL | Kalydeco (NDA, Vertex Pharmaceuticals Incorporated, 2026-03-23) |
| ivermectin-detail | ivermectin | ORAL | STROMECTOL (NDA, Merck Sharp & Dohme LLC, 2024-09-20) |
| ixekizumab | ixekizumab | SUBCUTANEOUS | TALTZ (BLA, Eli Lilly and Company, 2026-01-22) |
| ketamine | ketamine | INTRAMUSCULAR+INTRAVENOUS | Ketalar (NDA, Par Health USA, LLC, 2026-03-27) |
| ketamine-iv-depression | ketamine (IV, off-label depression) | INTRAMUSCULAR+INTRAVENOUS | Ketalar (NDA, Par Health USA, LLC, 2026-03-27) |
| ketoconazole | ketoconazole | ORAL | Recorlev (NDA, Xeris Pharmaceuticals, Inc., 2026-03-10) |
| ketorolac | Ketorolac trometamol | INTRAMUSCULAR; INTRAMUSCULAR+INTRAVENOUS | Ketorolac Tromethamine (ANDA, Nephron Pharmaceuticals Corporation, 2026-01-08); Ketorolac Tromethamine (ANDA, Hospira, Inc., 2026-07-20) |
| labetalol | labetalol | INTRAVENOUS; ORAL | Labetalol Hydrochloride (NDA, Hikma Pharmaceuticals USA Inc., 2025-12-19); Labetalol Hydrochloride (ANDA, BluePoint Laboratories Inc., 2026-06-08) |
| lacosamide | lacosamide | INTRAVENOUS+ORAL; ORAL | Vimpat (NDA, UCB, Inc., 2026-05-12); MOTPOLY XR (NDA, Aucta Pharmaceuticals, Inc., 2025-07-16) |
| lactulose | Lactulose | ORAL; ORAL+RECTAL | Lactulose (ANDA, APOZEAL PHARMACEUTICALS INC, 2026-07-23); Lactulose (ANDA, APOZEAL PHARMACEUTICALS INC, 2026-01-06) |
| lamivudine | lamivudine (3TC) | ORAL | Lamivudine (ANDA, Camber Pharmaceuticals, Inc., 2026-07-29) |
| lamotrigine | lamotrigine | ORAL | SUBVENITE (NDA, OWP Pharmaceuticals, Inc., 2026-06-04) |
| lanreotide | Lanreotide | SUBCUTANEOUS | SOMATULINE DEPOT (NDA, Ipsen Biopharmaceuticals, Inc., 2024-10-11) |
| lanreotide-detail | lanreotide | SUBCUTANEOUS | SOMATULINE DEPOT (NDA, Ipsen Biopharmaceuticals, Inc., 2024-10-11) |
| lapatinib | lapatinib | ORAL | TYKERB (NDA, Novartis Pharmaceuticals Corporation, 2026-01-27) |
| lasmiditan | lasmiditan | ORAL | Reyvow (NDA, Eli Lilly and Company, 2026-01-08) |
| ledipasvir-sofosbuvir | ledipasvir + sofosbuvir | ORAL | Ledipasvir and Sofosbuvir (NDA, Asegua Therapeutics LLC, 2025-01-10) |
| leflunomide | leflunomide | ORAL | Arava (NDA, sanofi-aventis U.S. LLC, 2025-06-04) |
| lenvatinib | lenvatinib | ORAL | Lenvima (NDA, Eisai Inc., 2026-06-30) |
| letrozole | letrozole | ORAL | Femara (NDA, Novartis Pharmaceuticals Corporation, 2026-06-11) |
| leuprolide | leuprolide | SUBCUTANEOUS | Vabrinty (NDA, URONOVA PHARMACEUTICALS, INC., 2026-04-30) |
| levetiracetam | Levetiracetam | INTRAVENOUS; ORAL | Keppra (NDA, UCB, Inc., 2025-06-30); Keppra (NDA, UCB, Inc., 2026-01-28) |
| levodopa-carbidopa | Levodopa/carbidopa (co-careldopa) | ENTERAL; ORAL | Duopa (NDA, AbbVie Inc., 2026-03-19); Dhivy (NDA, Avion Pharmaceuticals, LLC, 2026-08-21) |
| levofloxacin | Levofloxacin | INTRAVENOUS; ORAL | Levofloxacin (ANDA, Sagent Pharmaceuticals, 2026-07-21); Levofloxacin (ANDA, Chartwell RX, LLC, 2026-06-29) |
| levonorgestrel-ec | levonorgestrel (emergency contraception) | ORAL | Next Choice One Dose (NDA, Foundation Consumer Healthcare LLC, 2023-02-02) |
| levonorgestrel-ius | Levonorgestrel intrauterine system | INTRAUTERINE; ORAL | Skyla (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-03-04); Next Choice One Dose (NDA, Foundation Consumer Healthcare LLC, 2023-02-02) |
| levothyroxine | levothyroxine sodium (L-T4) | ORAL | Tirosint SOL (NDA, IBSA Pharma Inc., 2026-03-27) |
| lidocaine | lidocaine (lignocaine) | EPIDURAL+INFILTRATION+INTRACAUDAL; EPIDURAL+INFILTRATION+INTRACAUDAL+PERINEURAL; INFILTRATION+PERINEURAL+INTRAVENOUS+EPIDURAL+INTRACAUDAL; INTRAVENOUS | Lidocaine Hydrochloride (ANDA, Civica, Inc., 2026-06-10); Xylocaine MPF (NDA, Fresenius Kabi USA, LLC, 2024-05-13); Lidocaine Hydrochloride (ANDA, Hospira, Inc., 2026-08-05); Lidocaine Hydrochloride and Dextrose (NDA, Baxter Healthcare Corporation, 2026-02-20) |
| linagliptin | linagliptin | ORAL | Tradjenta (NDA, Boehringer Ingelheim Pharmaceuticals, Inc., 2025-03-21) |
| liothyronine | liothyronine (T3) | INTRAVENOUS; ORAL | Liothyronine Sodium (ANDA, XGen Pharmaceuticals DJB, Inc., 2023-12-01); Liothyronine Sodium (NDA, Mylan Pharmaceuticals Inc., 2026-06-04) |
| liposomal-amphotericin-b | Liposomal amphotericin B | INTRAVENOUS | Amphotericin B (ANDA, Sun Pharmaceutical Industries, Inc., 2026-04-20) |
| liraglutide | Liraglutide | SUBCUTANEOUS | Saxenda (NDA, Novo Nordisk Pharmaceutical Industries, LP, 2026-02-25) |
| liraglutide-detail | liraglutide | SUBCUTANEOUS | Saxenda (NDA, Novo Nordisk Pharmaceutical Industries, LP, 2026-02-25) |
| lisdexamfetamine | lisdexamfetamine | ORAL | Vyvanse (NDA, Takeda Pharmaceuticals America, Inc., 2026-04-30) |
| lisinopril | lisinopril | ORAL | Qbrelis (NDA, Azurity Pharmaceuticals, Inc., 2025-12-16) |
| lithium-er | lithium (extended-release) | ORAL | Lithium (ANDA, Saptalis Pharmaceuticals, LLC, 2025-08-20) |
| lofexidine | lofexidine | ORAL | Lofexidine hydrochloride (NDA, Prasco Laboratories, 2026-08-14) |
| loperamide | Loperamide | ORAL | anti-diarrheal (NDA, Amazon.com Services LLC, 2026-04-20) |
| loratadine | loratadine | ORAL | Alavert Allergy (NDA, Foundation Consumer Brands, 2026-02-23) |
| lorazepam | lorazepam | INTRAMUSCULAR+INTRAVENOUS | Lorazepam (NDA, Hikma Pharmaceuticals USA Inc., 2024-04-10) |
| lorlatinib | lorlatinib | ORAL | Lorbrena (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-06-26) |
| losartan | losartan | ORAL | COZAAR (NDA, Organon LLC, 2026-01-20) |
| lovastatin | lovastatin | ORAL | Lovastatin (ANDA, BluePoint Laboratories, 2026-05-27) |
| lurasidone | lurasidone | ORAL | Latuda (NDA, Sumitomo Pharma America, Inc., 2025-01-31) |
| macitentan | macitentan | ORAL | OPSUMIT (NDA, Actelion Pharmaceuticals US, Inc., 2025-04-11) |
| mannitol | mannitol | INTRAVENOUS | Mannitol (NDA, Hospira, Inc., 2026-04-21) |
| mefenamic-acid | Mefenamic acid | ORAL | Mefenamic Acid (ANDA, Lupin Pharmaceuticals, Inc., 2026-04-20) |
| mefloquine | Mefloquine | ORAL | Mefloquine Hydrochloride (ANDA, Teva Pharmaceuticals USA, Inc., 2025-09-26) |
| mefloquine-detail | mefloquine | ORAL | Mefloquine Hydrochloride (ANDA, Teva Pharmaceuticals USA, Inc., 2025-09-26) |
| memantine | Memantine | ORAL | memantine hydrochloride (NDA, Actavis Pharma, Inc., 2018-11-01) |
| memantine-detail | memantine | ORAL | memantine hydrochloride (NDA, Actavis Pharma, Inc., 2018-11-01) |
| mepolizumab | Mepolizumab | SUBCUTANEOUS | Nucala (BLA, GlaxoSmithKline LLC, 2025-08-06) |
| mepolizumab-detail | mepolizumab | SUBCUTANEOUS | Nucala (BLA, GlaxoSmithKline LLC, 2025-08-06) |
| mercaptopurine | mercaptopurine | ORAL | MERCAPTOPURINE (NDA, Nova Laboratories, Ltd, 2026-07-20) |
| meropenem | meropenem | INTRAVENOUS | Meropenem (NDA, WG Critical Care, LLC, 2026-09-08) |
| meropenem-vaborbactam | meropenem/vaborbactam | INTRAVENOUS | VABOMERE (NDA, Melinta Therapeutics, LLC, 2026-02-27) |
| mesna | mesna | INTRAVENOUS | MESNEX (NDA, Bamboo US Bidco LCC, 2025-12-10) |
| metformin | metformin | ORAL | Glumetza (NDA, Santarus, Inc., 2026-09-02) |
| methadone | methadone | ORAL | METHADOSE (NDA, SpecGx LLC, 2026-04-27) |
| methotrexate | methotrexate | INTRA-ARTERIAL+INTRAMUSCULAR+INTRATHECAL+INTRAVENOUS; INTRA-ARTERIAL+INTRAMUSCULAR+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS+INTRATHECAL; ORAL; SUBCUTANEOUS | Methotrexate (ANDA, Accord Healthcare, Inc., 2026-09-04); Methotrexate (ANDA, Fresenius Kabi USA, LLC, 2021-03-24); Methotrexate (NDA, Hospira, Inc., 2025-08-22); JYLAMVO (NDA, SHORLA ONCOLOGY INC., 2026-06-08); Rasuvo (NDA, Medexus Pharma Inc., 2025-12-15) |
| methotrexate-high-dose | methotrexate (high-dose) | INTRA-ARTERIAL+INTRAMUSCULAR+INTRATHECAL+INTRAVENOUS; INTRA-ARTERIAL+INTRAMUSCULAR+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS+INTRATHECAL; SUBCUTANEOUS | Methotrexate (ANDA, Accord Healthcare, Inc., 2026-09-04); Methotrexate (ANDA, Fresenius Kabi USA, LLC, 2021-03-24); Methotrexate (NDA, Hospira, Inc., 2025-08-22); Rasuvo (NDA, Medexus Pharma Inc., 2025-12-15) |
| methotrexate-low-dose | methotrexate (low-dose) | INTRA-ARTERIAL+INTRAMUSCULAR+INTRATHECAL+INTRAVENOUS; INTRA-ARTERIAL+INTRAMUSCULAR+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS+INTRATHECAL; ORAL; SUBCUTANEOUS | Methotrexate (ANDA, Accord Healthcare, Inc., 2026-09-04); Methotrexate (ANDA, Fresenius Kabi USA, LLC, 2021-03-24); Methotrexate (NDA, Hospira, Inc., 2025-08-22); JYLAMVO (NDA, SHORLA ONCOLOGY INC., 2026-06-08); Rasuvo (NDA, Medexus Pharma Inc., 2025-12-15) |
| methyldopa | methyldopa | ORAL | Methyldopa (NDA, Chartwell RX, LLC, 2025-03-26) |
| methylene-blue | Methylthioninium chloride (methylene blue) | INTRAVENOUS | PROVAYBLUE (NDA, American Regent, Inc., 2025-05-28) |
| methylphenidate | Methylphenidate | ORAL | methylphenidate hydrochloride CD (NDA, Lannett Company, LLC, 2026-07-31) |
| methylphenidate-detail | methylphenidate | ORAL | methylphenidate hydrochloride CD (NDA, Lannett Company, LLC, 2026-07-31) |
| metoclopramide | metoclopramide | INTRAMUSCULAR+INTRAVENOUS; ORAL | Metoclopramide (ANDA, Avenacy, LLC, 2026-06-10); Metoclopramide (NDA, ANI Pharmaceuticals, Inc., 2026-05-18) |
| metoprolol | metoprolol tartrate / succinate | ORAL | TOPROL XL (NDA, Melinta Therapeutics, LLC, 2026-03-03) |
| metronidazole | metronidazole | ORAL | Flagyl (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-05-22) |
| mexiletine | mexiletine | ORAL | MEXILETINE HYDROCHLORIDE (ANDA, Amerisyn LLC, 2026-08-10) |
| micafungin | micafungin | INTRAVENOUS | Mycamine (NDA, Astellas Pharma US, Inc., 2020-07-23) |
| miconazole-oral-gel | miconazole (oral gel) | BUCCAL | Oravig (NDA, Galt Pharmaceuticals, LLC, 2026-01-08) |
| midazolam | midazolam | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS; ORAL | Midazolam hydrochloride (ANDA, Heritage Pharmaceuticals Inc. d/b/a Avet Pharmaceuticals Inc., 2026-08-26); Midazolam in Sodium Chloride (NDA, WG Critical Care, LLC., 2025-07-31); Midazolam Hydrochloride (ANDA, Hikma Pharmaceuticals USA Inc., 2025-04-29) |
| mifepristone-detail | mifepristone | ORAL | Korlym (NDA, Corcept Therapeutics Incorporated, 2025-09-25) |
| milrinone | Milrinone | INTRAVENOUS | Milrinone Lactate (ANDA, Mullan Pharmaceutical Inc., 2026-07-27) |
| miltefosine | Miltefosine | ORAL | IMPAVIDO (NDA, Profounda, Inc., 2026-09-30) |
| minocycline | Minocycline | ORAL | Arestin (NDA, OraPharma, Inc., 2024-05-31) |
| mirabegron | Mirabegron | ORAL | Myrbetriq (NDA, Astellas Pharma US, Inc., 2024-08-01) |
| mirtazapine | Mirtazapine | ORAL | REMERONSOLTAB (NDA, Organon LLC, 2025-08-06) |
| mitoxantrone | mitoxantrone | INTRAVENOUS | Mitoxantrone (ANDA, Hospira, Inc., 2025-07-14) |
| montelukast | montelukast | ORAL | SINGULAIR (NDA, Organon LLC, 2025-04-30) |
| morphine | morphine sulphate | EPIDURAL+INTRATHECAL; EPIDURAL+INTRATHECAL+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS; ORAL | INFUMORPH 200 (NDA, Hikma Pharmaceuticals USA Inc., 2025-12-31); Duramorph (NDA, Hikma Pharmaceuticals USA Inc., 2025-12-31); Morphine Sulfate (NDA, Fresenius Kabi, USA LLC, 2026-08-31); Morphine Sulfate (NDA, Hospira, Inc., 2025-12-31); MS Contin (NDA, Rhodes Pharmaceuticals LLC, 2026-08-14) |
| moxifloxacin | Moxifloxacin | INTRAVENOUS; ORAL | Moxifloxacin (NDA, Hp Halden Pharma AS, 2024-07-17); Moxifloxacin (ANDA, Chartwell RX, LLC, 2026-08-17) |
| mupirocin-topical | mupirocin 2 % (topical) | TOPICAL | Mupirocin (ANDA, Sun Pharmaceutical Industries, Inc., 2026-04-10) |
| mycophenolate | mycophenolate mofetil | ORAL | MYHIBBIN (NDA, Azurity Pharmaceuticals, Inc., 2026-04-01) |
| mycophenolate-mofetil | Mycophenolate mofetil | ORAL | MYHIBBIN (NDA, Azurity Pharmaceuticals, Inc., 2026-04-01) |
| naloxone | naloxone | INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAMUSCULAR+SUBCUTANEOUS | Naloxone Hydrochloride (ANDA, Hospira, Inc., 2026-05-27); ZIMHI (NDA, ZMI Pharma Inc., 2025-12-04) |
| naloxone-detail | naloxone | INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAMUSCULAR+SUBCUTANEOUS | Naloxone Hydrochloride (ANDA, Hospira, Inc., 2026-05-27); ZIMHI (NDA, ZMI Pharma Inc., 2025-12-04) |
| naltrexone | naltrexone | ORAL | NALTREXONE HYDROCHLORIDE (ANDA, SpecGx LLC, 2026-09-04) |
| naproxen | Naproxen | ORAL | naproxen sodium (NDA, Bionpharma Inc., 2026-05-12) |
| natalizumab | natalizumab | INTRAVENOUS | TYRUKO (BLA, Sandoz Inc, 2025-10-31) |
| natamycin | Natamycin (topical ophthalmic) | OPHTHALMIC | NATACYN (NDA, Eyevance Pharmaceuticals, LLC, 2025-11-05) |
| neostigmine | Neostigmine | INTRAVENOUS | Neostigmine Methylsulfate (NDA, Fresenius Kabi USA, LLC, 2024-10-15) |
| nicotine-replacement | nicotine (replacement therapy) | BUCCAL; ORAL; TRANSDERMAL | Nicorette 4mg Fruit Chill Gum, Lil Drug Store (NDA, Lil' Drug Store Products, Inc., 2024-01-09); Nicorette Peppermint (NDA, Haleon US Holdings LLC, 2025-07-31); Nicotine Transdermal System step 3 (NDA, AmerisourceBergen Drug Corporation, 2026-07-01) |
| nifedipine | nifedipine | ORAL | Procardia XL (NDA, Pfizer Laboratories Div Pfizer Inc, 2025-12-16) |
| nifurtimox | Nifurtimox | ORAL | LAMPIT (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-03-03) |
| nifurtimox-detail | nifurtimox | ORAL | LAMPIT (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-03-03) |
| nilotinib | nilotinib | ORAL | CAVHANZA (NDA, Cycle Pharmaceuticals Ltd, 2026-08-07) |
| nimodipine | nimodipine | ORAL | Nymalize (NDA, Azurity Pharmaceuticals, Inc., 2024-08-30) |
| nintedanib-detail | nintedanib | ORAL | Ofev (NDA, Boehringer Ingelheim Pharmaceuticals, Inc., 2025-11-20) |
| niraparib | niraparib | ORAL | ZEJULA (NDA, GlaxoSmithKline LLC, 2026-07-28) |
| nitazoxanide | Nitazoxanide | ORAL | Nitazoxanide (ANDA, Camber Pharmaceuticals, Inc., 2025-12-30) |
| nitrofurantoin | nitrofurantoin | ORAL | Nitrofurantoin (NDA, Rising Pharma Holdings, Inc., 2025-11-11) |
| nivolumab | nivolumab | INTRAVENOUS | OPDIVO (BLA, E.R. Squibb & Sons, L.L.C., 2026-08-12) |
| noradrenaline | Noradrenaline (norepinephrine) | INTRAVENOUS | NOREPINEPHRINE BITARTRATE IN SODIUM CHLORIDE (NDA, WG Critical Care, LLC, 2026-02-17) |
| noradrenaline-vasopressin-fixed-combo | esmolol | INTRAVENOUS | BREVIBLOC (NDA, Baxter Healthcare Company, 2025-03-14) |
| nortriptyline | nortriptyline | ORAL | PAMELOR (NDA, SpecGx LLC, 2024-12-04) |
| nystatin | nystatin | ORAL; TOPICAL | Nystatin (NDA, Chartwell RX, LLC, 2026-03-05); Nystatin (ANDA, Torrent Pharmaceuticals Limited, 2026-05-08) |
| ocrelizumab | ocrelizumab | INTRAVENOUS | OCREVUS (BLA, Genentech, Inc., 2026-05-14) |
| octreotide | octreotide | INTRAVENOUS+SUBCUTANEOUS; SUBCUTANEOUS | Sandostatin (NDA, Novartis Pharmaceuticals Corporation, 2026-07-22); BYNFEZIA Pen (NDA, Sun Pharmaceutical Industries, Inc., 2025-02-21) |
| octreotide-detail | octreotide | INTRAVENOUS+SUBCUTANEOUS; SUBCUTANEOUS | Sandostatin (NDA, Novartis Pharmaceuticals Corporation, 2026-07-22); BYNFEZIA Pen (NDA, Sun Pharmaceutical Industries, Inc., 2025-02-21) |
| ofatumumab | ofatumumab | SUBCUTANEOUS | KESIMPTA (BLA, Novartis Pharmaceuticals Corporation, 2026-04-01) |
| olanzapine | olanzapine | INTRAMUSCULAR; ORAL; ORAL+INTRAMUSCULAR | Olanzapine (ANDA, Hikma Pharmaceuticals USA Inc., 2026-08-25); Olanzapine (ANDA, Dr. Reddy's Laboratories Ltd., 2026-07-09); Zyprexa (NDA, H2-Pharma LLC, 2026-02-11) |
| olanzapine-lai | olanzapine pamoate (LAI) | INTRAMUSCULAR; ORAL+INTRAMUSCULAR | Olanzapine (ANDA, Hikma Pharmaceuticals USA Inc., 2026-08-25); Zyprexa (NDA, H2-Pharma LLC, 2026-02-11) |
| olaparib | olaparib | ORAL | Lynparza (NDA, AstraZeneca Pharmaceuticals LP, 2025-07-10) |
| omadacycline | omadacycline | INTRAVENOUS+ORAL | NUZYRA (NDA, Paratek Pharmaceuticals, Inc., 2026-05-27) |
| omalizumab-detail | omalizumab | SUBCUTANEOUS | XOLAIR (BLA, Genentech, Inc., 2026-08-13) |
| omeprazole | omeprazole | ORAL | omeprazole (NDA, Rite Aid Corporation, 2026-09-09) |
| ondansetron | ondansetron | INTRAMUSCULAR+INTRAVENOUS; ORAL | Ondansetron (ANDA, Hospira, Inc., 2026-05-23); ondansetron (ANDA, Ascend Laboratories, LLC, 2026-07-22) |
| oritavancin | oritavancin | INTRAVENOUS | Kimyrsa (NDA, Melinta Therapeutics, LLC, 2025-12-18) |
| ors | oral rehydration salts (WHO low-osmolarity) | ORAL | ValuMeds Nasal Decongestant PE Phenylephrine (other, Cabinet Health P.B.C., 2026-07-10) |
| oseltamivir | oseltamivir | ORAL | Tamiflu (NDA, Genentech, Inc., 2025-12-15) |
| oseltamivir-detail | oseltamivir | ORAL | Tamiflu (NDA, Genentech, Inc., 2025-12-15) |
| osimertinib | osimertinib | ORAL | TAGRISSO (NDA, AstraZeneca Pharmaceuticals LP, 2024-09-25) |
| oxaliplatin | oxaliplatin | INTRAVENOUS | Oxaliplatin (ANDA, Gland Pharma Limited, 2026-08-24) |
| oxcarbazepine | oxcarbazepine | ORAL | Trileptal (NDA, Novartis Pharmaceuticals Corporation, 2025-12-16) |
| oxybutynin | oxybutynin | ORAL | Oxybutynin Chloride (ANDA, TruPharma LLC, 2026-07-27) |
| oxycodone | Oxycodone | ORAL | OxyContin (NDA, Knoa Pharma LLC, 2026-06-24) |
| oxytocin | oxytocin | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | Oxytocin (NDA, Fresenius Kabi USA, LLC, 2026-01-12); Pitocin (NDA, Par Health USA, LLC, 2026-05-06) |
| ozanimod | ozanimod | ORAL | ZEPOSIA 7-Day Starter Pack (NDA, Celgene Corporation, 2026-04-16) |
| paclitaxel | paclitaxel | INTRAVENOUS | Paclitaxel (NDA, Teva Pharmaceuticals, Inc., 2023-11-01) |
| palbociclib | palbociclib | ORAL | Ibrance (NDA, U.S. Pharmaceuticals, 2026-07-06) |
| paliperidone | paliperidone | INTRAMUSCULAR; ORAL | Erzofri extended-release (NDA, Shandong Luye Pharmaceutical Co., Ltd., 2026-03-09); INVEGA (NDA, Janssen Pharmaceuticals, Inc., 2025-01-31) |
| paliperidone-lai | paliperidone palmitate (LAI) | INTRAMUSCULAR | Erzofri extended-release (NDA, Shandong Luye Pharmaceutical Co., Ltd., 2026-03-09) |
| paliperidone-palmitate | Paliperidone palmitate (long-acting injectable) | INTRAMUSCULAR | Erzofri extended-release (NDA, Shandong Luye Pharmaceutical Co., Ltd., 2026-03-09) |
| palonosetron | palonosetron | INTRAVENOUS | posfrea (NDA, Avyxa Pharma, LLC, 2025-04-29) |
| panitumumab | panitumumab | INTRAVENOUS | Vectibix (BLA, Amgen, Inc, 2026-06-23) |
| pantoprazole | Pantoprazole | INTRAVENOUS; ORAL | Protonix I.V. (NDA, Wyeth Pharmaceuticals LLC, a subsidiary of Pfizer Inc., 2025-12-22); Protonix Delayed-Release (NDA, Wyeth Pharmaceuticals LLC, a subsidiary of Pfizer Inc., 2026-05-18) |
| paracetamol | paracetamol | ORAL | Tylenol 8 HR Arthritis Pain (NDA, Kenvue Brands LLC, 2024-11-13) |
| paracetamol-iv | paracetamol (intravenous) | INTRAVENOUS | Acetaminophen (NDA, Hikma Pharmaceuticals USA Inc., 2025-08-18) |
| paromomycin | Paromomycin | ORAL | Humatin (ANDA, Waylis Therapeutics LLC, 2025-11-13) |
| paromomycin-im | Paromomycin (IM) | ORAL | Humatin (ANDA, Waylis Therapeutics LLC, 2025-11-13) |
| paroxetine | paroxetine | ORAL | PAXIL CR (NDA, Apotex Corp, 2025-09-22) |
| pegfilgrastim | pegfilgrastim | SUBCUTANEOUS | Neulasta (BLA, Amgen, Inc, 2026-08-10) |
| pembrolizumab | pembrolizumab | INTRAVENOUS | KEYTRUDA (BLA, Merck Sharp & Dohme LLC, 2026-07-10) |
| penicillamine | Penicillamine | ORAL | Cuprimine (NDA, Bausch Health US, LLC, 2026-01-26) |
| penicillin-v | phenoxymethylpenicillin (penicillin V) | ORAL | Penicillin V Potassium (ANDA, Chartwell RX, LLC, 2026-07-23) |
| pentamidine | Pentamidine isetionate | INTRAMUSCULAR+INTRAVENOUS; RESPIRATORY (INHALATION) | Pentam 300 (NDA, Fresenius Kabi USA, LLC, 2022-09-13); NebuPent (NDA, Fresenius Kabi USA, LLC, 2024-10-15) |
| perampanel | perampanel | ORAL | Fycompa (NDA, Catalyst Pharmaceuticals, Inc., 2024-01-05) |
| pertuzumab | pertuzumab | INTRAVENOUS | PERJETA (BLA, Genentech, Inc., 2026-04-30) |
| pethidine | pethidine | INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS | DEMEROL (NDA, Hospira, Inc., 2026-07-20) |
| phenelzine | phenelzine | ORAL | phenelzine sulfate (NDA, Mylan Pharmaceuticals Inc., 2026-05-21) |
| phenobarbital | Phenobarbital | INTRAMUSCULAR; INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS; ORAL | Phenobarbital Sodium (other, Cameron Pharmaceuticals, 2025-06-04); Phenobarbital Sodium (other, BPI Labs LLC, 2025-12-17); SEZABY (NDA, Sun Pharmaceutical Industries, Inc., 2025-12-23); Phenobarbital (other, Chartwell RX, LLC, 2026-08-27) |
| phenylephrine | Phenylephrine | INTRAVENOUS | Phenylephrine Hydrochloride (NDA, Hikma Pharmaceuticals USA Inc., 2026-08-19) |
| phenytoin | phenytoin | INTRAMUSCULAR+INTRAVENOUS | PHENYTOIN SODIUM (ANDA, Acella Pharmaceuticals, LLC, 2024-09-16) |
| pioglitazone | Pioglitazone | ORAL | Actos (NDA, Takeda Pharmaceuticals America, Inc., 2025-03-28) |
| pirfenidone | pirfenidone | ORAL | ESBRIET (NDA, Genentech, Inc., 2025-12-05) |
| pitavastatin | pitavastatin | ORAL | Livalo (NDA, Kowa Pharmaceuticals America, Inc., 2026-03-31) |
| plazomicin | plazomicin | INTRAVENOUS | Zemdri (plazomicin) (NDA, Cipla USA Inc., 2024-12-20) |
| polatuzumab-vedotin | polatuzumab vedotin | INTRAVENOUS | POLIVY (BLA, Genentech, Inc., 2026-08-24) |
| ponesimod | ponesimod | ORAL | PONVORY (NDA, Vanda Pharmaceuticals Inc., 2025-12-04) |
| posaconazole | posaconazole | INTRAVENOUS; ORAL; ORAL+INTRAVENOUS | posaconazole (ANDA, Mylan Institutional LLC, 2026-07-15); POSACONAZOLE (NDA, ENDO USA, Inc., 2026-02-18); NOXAFIL (NDA, Merck Sharp & Dohme LLC, 2026-02-13) |
| potassium-iodide | potassium iodide | ORAL | IOSAT (NDA, Anbex Inc., 2025-10-03) |
| pralidoxime | Pralidoxime chloride | INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS | Protopam Chloride (NDA, Baxter Healthcare Corporation, 2026-04-01) |
| prasugrel | prasugrel | ORAL | Effient (NDA, Cosette Pharmaceuticals, Inc., 2022-09-07) |
| pravastatin | pravastatin | ORAL | PRAVASTATIN SODIUM (ANDA, CIPLA USA INC., 2026-09-03) |
| praziquantel | praziquantel | ORAL | Biltricide (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-03-02) |
| praziquantel-detail | praziquantel | ORAL | Biltricide (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-03-02) |
| prazosin | Prazosin | ORAL | Prazosin Hydrochloride (NDA, Prasco Laboratories, 2026-03-06) |
| prednisolone-acetate-ophthalmic | Prednisolone acetate (ophthalmic) | OPHTHALMIC | PRED MILD (NDA, Allergan, Inc., 2025-11-25) |
| pregabalin | Pregabalin | ORAL | Lyrica CR (NDA, Viatris Specialty LLC, 2026-03-12) |
| pretomanid | Pretomanid | ORAL | Pretomanid (NDA, Viatris Specialty LLC, 2024-11-15) |
| primaquine-radical | primaquine (radical cure) | ORAL | Primaquine Phosphate (NDA, Sanofi-Aventis U.S. LLC, 2026-02-11) |
| procaine-benzylpenicillin | Procaine benzylpenicillin | INTRAMUSCULAR; INTRAMUSCULAR+INTRAPLEURAL+INTRATHECAL+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | BICILLIN L-A (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-07-21); Pfizerpen (ANDA, Roerig, 2025-12-16); Penicillin G Potassium (ANDA, WG Critical Care, LLC, 2026-06-24); PENICILLIN G POTASSIUM (NDA, Baxter Healthcare Corporation, 2026-07-24) |
| prochlorperazine | prochlorperazine | INTRAMUSCULAR+INTRAVENOUS; ORAL | Prochlorperazine Edisylate (ANDA, Caplin Steriles Limited, 2026-04-08); Prochlorperazine Maleate (ANDA, ANI Pharmaceuticals, Inc., 2026-05-14) |
| progesterone | progesterone | VAGINAL | ENDOMETRIN (NDA, Ferring Pharmaceuticals Inc., 2026-07-29) |
| promethazine | Promethazine | INTRAMUSCULAR+INTRAVENOUS; ORAL | Promethazine Hydrochloride (ANDA, Hikma Pharmaceuticals USA Inc., 2025-06-30); PROMETHAZINE HYDROCHLORIDE (ANDA, KVK-Tech, Inc., 2026-03-13) |
| propafenone | propafenone | ORAL | propafenone hydrochloride (ANDA, Northstar Rx LLC, 2026-06-04) |
| propofol | propofol | INTRAVENOUS | Diprivan (NDA, Fresenius Kabi USA, LLC, 2025-09-11) |
| propranolol | propranolol | ORAL | Propranolol Hydrochloride ER (NDA, ANI Pharmaceuticals, Inc., 2026-08-27) |
| propylthiouracil | Propylthiouracil (PTU) | ORAL | Propylthiouracil (NDA, Par Health USA, LLC, 2026-08-25) |
| pyrantel-pamoate | Pyrantel pamoate | ORAL | PINRID (other, YYBA CORP, 2026-05-25) |
| pyrazinamide | pyrazinamide | ORAL | Pyrazinamide (ANDA, ANI Pharmaceuticals, Inc., 2026-03-02) |
| pyridostigmine | Pyridostigmine bromide | ORAL | Pyridostigmine bromide (NDA, Amneal Pharmaceuticals LLC, 2026-05-13) |
| pyrimethamine | Pyrimethamine | ORAL | Daraprim (NDA, Vyera Pharmaceuticals LLC, 2021-11-11) |
| quetiapine | Quetiapine | ORAL | SEROQUEL (NDA, H2-Pharma, LLC, 2026-04-10) |
| quinine | quinine sulphate / dihydrochloride | ORAL | QUININE SULFATE (ANDA, Lupin Pharmaceuticals, Inc., 2025-10-31) |
| raltegravir | Raltegravir | ORAL | ISENTRESS (NDA, Merck Sharp & Dohme LLC, 2024-10-18) |
| ramipril | ramipril | ORAL | Ramipril (ANDA, BluePoint Laboratories, 2026-09-04) |
| ranibizumab | ranibizumab | INTRAVITREAL | NUFYMCO (BLA, Zydus Pharmaceuticals USA Inc., 2026-06-04) |
| ranitidine | ranitidine | ORAL | Ranitidine (ANDA, Amneal Pharmaceuticals of New York LLC, 2026-05-01) |
| ranolazine | Ranolazine | ORAL | ASPRUZYO SPRINKLE (NDA, SUN PHARMACEUTICAL INDUSTRIES, INC., 2025-01-29) |
| ranolazine-detail | ranolazine | ORAL | ASPRUZYO SPRINKLE (NDA, SUN PHARMACEUTICAL INDUSTRIES, INC., 2025-01-29) |
| regorafenib | regorafenib | ORAL | Stivarga (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-02-09) |
| remdesivir | remdesivir | INTRAVENOUS | Veklury (NDA, Gilead Sciences, Inc., 2026-07-29) |
| repaglinide | repaglinide | ORAL | Repaglinide (ANDA, NorthStar RxLLC, 2025-09-15) |
| reslizumab | reslizumab | INTRAVENOUS | CINQAIR (BLA, Teva Respiratory, LLC, 2020-02-29) |
| ribavirin | ribavirin | ORAL | Ribavirin (ANDA, Aurobindo Pharma Limited, 2024-02-06) |
| ribavirin-oral | Ribavirin (oral) | ORAL | Ribavirin (ANDA, Aurobindo Pharma Limited, 2024-02-06) |
| ribociclib | ribociclib | ORAL | KISQALI (NDA, Novartis Pharmaceuticals Corporation, 2026-07-01) |
| rifampicin | rifampicin | ORAL | rifampin (ANDA, Lupin Pharmaceuticals, Inc., 2026-02-11) |
| rifapentine | rifapentine | ORAL | Priftin (NDA, sanofi-aventis U.S. LLC, 2026-02-06) |
| rifaximin | rifaximin | ORAL | XIFAXAN (NDA, Salix Pharmaceuticals, Inc., 2025-06-25) |
| riluzole | riluzole | ORAL | TIGLUTIK (NDA, Italfarmaco SPA, 2026-07-29) |
| rimegepant | rimegepant | ORAL | NURTEC ODT (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-06-04) |
| ringer-lactate | Ringer's lactate (Hartmann's solution) | INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAVASCULAR; INTRAVENOUS | BACTERIOSTATIC SODIUM CHLORIDE (NDA, Hospira, Inc., 2026-04-03); SODIUM CHLORIDE (NDA, Liebel-Flarsheim Company LLC, 2022-12-20); Sodium Chloride (NDA, Hospira, Inc., 2026-05-19) |
| riociguat | riociguat | ORAL | Adempas (NDA, Bayer HealthCare Pharmaceuticals Inc., 2026-08-13) |
| risankizumab | risankizumab | SUBCUTANEOUS+INTRAVENOUS | Skyrizi (BLA, AbbVie Inc., 2026-06-15) |
| risedronate | risedronate | ORAL | Risedronate Sodium (ANDA, Teva Pharmaceuticals USA, Inc., 2026-03-30) |
| risperidone | Risperidone | ORAL | Risperidone (NDA, Janssen Pharmaceuticals, Inc., 2026-08-20) |
| ritonavir | ritonavir | ORAL | Norvir (NDA, AbbVie Inc., 2026-07-23) |
| rituximab | Rituximab | INTRAVENOUS | Ruxience (BLA, Pfizer Laboratories Div Pfizer Inc, 2026-08-26) |
| rivaroxaban | rivaroxaban | ORAL | Xarelto (NDA, Janssen Pharmaceuticals, Inc., 2026-09-10) |
| rivastigmine | Rivastigmine | ORAL; TRANSDERMAL | Rivastigmine Tartrate (ANDA, Aurobindo Pharma Limited, 2024-06-19); Exelon (NDA, Novartis Pharmaceuticals Corporation, 2024-05-08) |
| rivastigmine-detail | rivastigmine | ORAL; TRANSDERMAL | Rivastigmine Tartrate (ANDA, Aurobindo Pharma Limited, 2024-06-19); Exelon (NDA, Novartis Pharmaceuticals Corporation, 2024-05-08) |
| roflumilast | roflumilast | ORAL | Daliresp (NDA, AstraZeneca Pharmaceuticals LP, 2020-03-12) |
| romosozumab | romosozumab | SUBCUTANEOUS | Evenity (BLA, Amgen, Inc, 2026-07-16) |
| rosuvastatin | rosuvastatin | ORAL | Crestor (NDA, AstraZeneca Pharmaceuticals LP, 2026-04-29) |
| rosuvastatin-detail | rosuvastatin | ORAL | Crestor (NDA, AstraZeneca Pharmaceuticals LP, 2026-04-29) |
| sacituzumab-govitecan | sacituzumab govitecan | INTRAVENOUS | TRODELVY (BLA, Gilead Sciences, Inc., 2026-06-24) |
| sacubitril-valsartan-detail | sacubitril/valsartan | ORAL | ENTRESTO (NDA, Novartis Pharmaceuticals Corporation, 2026-07-06) |
| salbutamol | salbutamol (albuterol) | RESPIRATORY (INHALATION) | Albuterol Sulfate (NDA, Sandoz Inc, 2025-12-16) |
| salmeterol | salmeterol | ORAL+RESPIRATORY (INHALATION) | SEREVENT DISKUS (NDA, GlaxoSmithKline LLC, 2022-10-10) |
| sarilumab | sarilumab | SUBCUTANEOUS | KEVZARA (BLA, Sanofi-Aventis U.S. LLC, 2026-02-27) |
| saxagliptin | saxagliptin | ORAL | SAXAGLIPTIN (ANDA, Glenmark Pharmaceuticals Inc., USA, 2026-01-27) |
| secukinumab | secukinumab | SUBCUTANEOUS+INTRAVENOUS | COSENTYX (BLA, Novartis Pharmaceuticals Corporation, 2026-08-25) |
| selexipag | selexipag | ORAL; ORAL+INTRAVENOUS | Selexipag (ANDA, Zydus Lifesciences Limited, 2025-11-07); UPTRAVI (NDA, Actelion Pharmaceuticals US, Inc., 2026-05-28) |
| semaglutide-oral | semaglutide (oral) | ORAL | OZEMPIC (NDA, Novo Nordisk Pharmaceutical Industries, LP, 2026-01-30) |
| sertraline | sertraline | ORAL | sertraline hydrochloride (NDA, Alvogen, Inc., 2025-08-06) |
| sevelamer | Sevelamer carbonate | ORAL; ORAL+PARENTERAL | Sevelamer Carbonate (NDA, Sanofi-Aventis U.S. LLC, 2025-11-25); sevelamer hydrochloride (ANDA, Glenmark Pharmaceuticals Inc., USA, 2026-01-27) |
| sildenafil | sildenafil | ORAL; ORAL+INTRAVENOUS | Sildenafil (NDA, Yaral Pharma Inc., 2026-07-17); Revatio (NDA, Viatris Specialty LLC, 2024-12-18) |
| sildenafil-pah | sildenafil | ORAL; ORAL+INTRAVENOUS | Sildenafil (NDA, Yaral Pharma Inc., 2026-07-17); Revatio (NDA, Viatris Specialty LLC, 2024-12-18) |
| silver-nitrate-cautery | Silver nitrate (topical cautery) | TOPICAL | ANTIBACTERIAL FEMININE WIPE (other, Foshan Sugar Max Cosmetics CO.,Ltd, 2025-12-10) |
| simvastatin | simvastatin | ORAL | ZOCOR (NDA, Organon LLC, 2025-03-28) |
| siponimod | siponimod | ORAL | MAYZENT (NDA, Novartis Pharmaceuticals Corporation, 2026-06-30) |
| sirolimus | sirolimus | ORAL | Sirolimus (NDA, Mylan Pharmaceuticals Inc., 2026-03-26) |
| sitagliptin | Sitagliptin | ORAL | Sitagliptin (NDA, Zydus Pharmaceuticals (USA) Inc., 2025-01-31) |
| sodium-bicarbonate | sodium bicarbonate | INTRAVENOUS | sodium bicarbonate (NDA, Baxter Healthcare Corporation, 2026-08-14) |
| sodium-chloride-0-9 | sodium chloride 0.9 % | INTRAMUSCULAR+INTRAVENOUS+SUBCUTANEOUS; INTRAVASCULAR | BACTERIOSTATIC SODIUM CHLORIDE (NDA, Hospira, Inc., 2026-04-03); SODIUM CHLORIDE (NDA, Liebel-Flarsheim Company LLC, 2022-12-20) |
| sodium-nitroprusside | Sodium nitroprusside | INTRAVENOUS | NIPRIDE RTU (NDA, EXELA PHARMA SCIENCES, LLC, 2018-07-20) |
| sofosbuvir | sofosbuvir | ORAL | Sovaldi (NDA, Gilead Sciences, Inc., 2024-12-26) |
| sofosbuvir-velpatasvir-detail | sofosbuvir + velpatasvir | ORAL | Sofosbuvir and Velpatasvir (NDA, Asegua Therapeutics LLC, 2025-03-06) |
| solifenacin | Solifenacin | ORAL | Solifenacin succinate (ANDA, HEC Pharm USA Inc., 2026-07-06) |
| sorafenib | sorafenib | ORAL | Nexavar (NDA, Bayer HealthCare Pharmaceuticals Inc., 2023-08-28) |
| sotalol | Sotalol | ORAL | BETAPACE (NDA, Legacy Pharma USA, Inc., 2024-12-16) |
| spironolactone | spironolactone | ORAL | Aldactone (NDA, Pfizer Laboratories Div Pfizer Inc, 2025-11-28) |
| streptomycin | Streptomycin | INTRAMUSCULAR | Streptomycin (ANDA, XGen Pharmaceuticals DJB, Inc., 2026-01-21) |
| sucralfate | sucralfate | ORAL | Carafate (NDA, Allergan, Inc., 2024-05-21) |
| sugammadex | Sugammadex | INTRAVENOUS | BRIDION (NDA, Merck Sharp & Dohme LLC, 2026-03-13) |
| sulfadiazine | Sulfadiazine | ORAL | sulfADIAZINE (ANDA, Chartwell RX, LLC, 2024-09-24) |
| sulfasalazine | sulfasalazine | ORAL | Sulfasalazine (NDA, Mylan Pharmaceuticals Inc., 2026-08-25) |
| sumatriptan | sumatriptan | NASAL; ORAL; SUBCUTANEOUS | SUMATRIPTAN (NDA, Prasco Laboratories, 2026-01-29); IMITREX (NDA, GlaxoSmithKline LLC, 2025-12-09); IMITREX (NDA, GlaxoSmithKline LLC, 2025-12-09) |
| sunitinib | sunitinib | ORAL | SUTENT (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-02-20) |
| surfactant-poractant | poractant alfa (porcine surfactant) | ENDOTRACHEAL | Curosurf (BLA, Chiesi USA, Inc., 2025-12-10) |
| suxamethonium | suxamethonium (succinylcholine) | INTRAMUSCULAR+INTRAVENOUS; INTRAMUSCULAR+INTRAVENOUS+PARENTERAL | QUELICIN (NDA, Hospira, Inc., 2026-08-18); Anectine (NDA, Sandoz Inc, 2023-11-29) |
| tacrolimus | Tacrolimus | ORAL; ORAL+INTRAVENOUS | Envarsus XR (NDA, Veloxis Pharmaceuticals, Inc, 2025-02-26); Prograf (NDA, Astellas Pharma US, Inc., 2023-08-25) |
| tadalafil-pah | tadalafil | ORAL | Cialis (NDA, Eli Lilly and Company, 2026-06-03) |
| tafenoquine | Tafenoquine | ORAL | Arakoda (NDA, 60 Degrees Pharmaceuticals, INC., 2025-01-10) |
| tafenoquine-detail | tafenoquine | ORAL | Arakoda (NDA, 60 Degrees Pharmaceuticals, INC., 2025-01-10) |
| talazoparib | talazoparib | ORAL | Talzenna (NDA, U.S. Pharmaceuticals, 2026-06-01) |
| tamoxifen | Tamoxifen | ORAL | SOLTAMOX (NDA, Mayne Pharma, 2021-11-29) |
| tedizolid | tedizolid | INTRAVENOUS+ORAL | SIVEXTRO (NDA, Merck Sharp & Dohme LLC, 2026-02-27) |
| tenofovir | tenofovir (umbrella) | ORAL | VEMLIDY (NDA, Gilead Sciences, Inc., 2025-07-14) |
| tenofovir-alafenamide | tenofovir alafenamide | ORAL | VEMLIDY (NDA, Gilead Sciences, Inc., 2025-07-14) |
| tenofovir-alafenamide-detail | tenofovir alafenamide | ORAL | VEMLIDY (NDA, Gilead Sciences, Inc., 2025-07-14) |
| tenofovir-disoproxil | tenofovir disoproxil fumarate | ORAL | Viread (NDA, Gilead Sciences, Inc., 2025-02-18) |
| tenofovir-disoproxil-fumarate | tenofovir disoproxil fumarate | ORAL | Viread (NDA, Gilead Sciences, Inc., 2025-02-18) |
| terbinafine-detail | terbinafine | ORAL | Terbinafine (ANDA, Cipla USA Inc., 2025-09-19) |
| teriflunomide | teriflunomide | ORAL | Aubagio (NDA, Genzyme Corporation, 2026-02-20) |
| teriparatide | teriparatide | SUBCUTANEOUS | Yorvipath (NDA, Ascendis Pharma, Endocrinology, Inc., 2026-08-12) |
| terlipressin | terlipressin | INTRAVENOUS | Terlivaz (NDA, Mallinckrodt Hospital Products Inc., 2026-06-19) |
| testosterone | testosterone | INTRAMUSCULAR; SUBCUTANEOUS; TOPICAL; TRANSDERMAL | AZMIRO (NDA, Azurity Pharmaceuticals, Inc., 2025-07-25); XYOSTED (NDA, Antares Pharma, Inc., 2025-07-01); Vogelxo (NDA, Upsher-Smith Laboratories, LLC, 2025-07-14); Testim (NDA, Endo USA, Inc., 2025-07-15) |
| tetrabenazine | tetrabenazine | ORAL | tetrabenazine (NDA, Oceanside Pharmaceuticals, 2019-11-29) |
| tetracaine-ophthalmic | Tetracaine (ophthalmic) | OPHTHALMIC | Tetracaine Hydrochloride (NDA, Bausch & Lomb Americas Inc., 2026-02-07) |
| tetracycline | tetracycline | ORAL | tetracycline hydrochloride (NDA, Heritage Pharmaceuticals Inc. d/b/a Avet Pharmaceuticals Inc., 2025-03-18) |
| tezepelumab | tezepelumab | SUBCUTANEOUS | TEZSPIRE (BLA, Amgen Inc, 2025-10-17) |
| thalidomide | thalidomide | ORAL | Thalomid (NDA, Celgene Corporation, 2023-03-24) |
| theophylline | theophylline | ORAL | theophylline (ANDA, Amneal Pharmaceuticals NY LLC, 2026-04-27) |
| ticagrelor | Ticagrelor | ORAL | BRILINTA (NDA, AstraZeneca Pharmaceuticals LP, 2026-05-07) |
| tildrakizumab | tildrakizumab | SUBCUTANEOUS | ILUMYA (BLA, Sun Pharmaceutical Industries, Inc., 2026-07-29) |
| timolol | timolol | OPHTHALMIC | BETIMOL (NDA, Thea Pharma Inc., 2025-06-27) |
| timolol-eye-drops | Timolol (ophthalmic) | OPHTHALMIC | BETIMOL (NDA, Thea Pharma Inc., 2025-06-27) |
| timolol-ophthalmic | Timolol (ophthalmic) | OPHTHALMIC | BETIMOL (NDA, Thea Pharma Inc., 2025-06-27) |
| tinidazole | Tinidazole | ORAL | Tinidazole (NDA, BioComp Pharma, Inc., 2025-12-01) |
| tiotropium | tiotropium | ORAL+RESPIRATORY (INHALATION) | Spiriva HandiHaler (NDA, Boehringer Ingelheim Pharmaceuticals, Inc., 2025-11-10) |
| tirzepatide | tirzepatide | SUBCUTANEOUS | Zepbound (NDA, Eli Lilly and Company, 2026-08-28) |
| tobramycin | tobramycin | INTRAMUSCULAR+INTRAVENOUS; INTRAVENOUS | TOBRAMYCIN (ANDA, Hospira, Inc., 2026-04-13); Tobramycin (NDA, Fresenius Kabi USA, LLC, 2024-02-07) |
| tocilizumab-detail | tocilizumab | INTRAVENOUS; INTRAVENOUS+SUBCUTANEOUS; SUBCUTANEOUS | TOFIDENCE (BLA, Organon LLC, 2026-05-22); AVTOZMA (BLA, CELLTRION USA, Inc., 2026-07-27); TYENNE (BLA, Fresenius Kabi USA, LLC, 2026-08-26) |
| tofacitinib | tofacitinib | ORAL | XELJANZ (NDA, U.S. Pharmaceuticals, 2026-07-13) |
| tolvaptan | Tolvaptan | ORAL | SAMSCA (NDA, Otsuka America Pharmaceutical, Inc., 2026-05-07) |
| topical-hydrocortisone | hydrocortisone (topical) | TOPICAL | Hydrocortisone Butyrate (NDA, Oceanside Pharmaceuticals, 2025-06-05) |
| topiramate | Topiramate | ORAL | QUDEXY XR (NDA, Upsher-Smith Laboratories, LLC, 2026-09-03) |
| topotecan | topotecan | INTRAVENOUS | HYCAMTIN (NDA, Novartis Pharmaceuticals Corporation, 2022-07-07) |
| tramadol | tramadol | ORAL | Tramadol Hydrochloride Extended-Release (NDA, Trigen Laboratories, LLC, 2026-01-23) |
| trametinib | trametinib | ORAL | Mekinist (NDA, Novartis Pharmaceuticals Corporation, 2026-05-07) |
| trastuzumab | Trastuzumab | INTRAVENOUS | OGIVRI (BLA, Biocon Biologics Inc., 2026-06-26) |
| trastuzumab-detail | trastuzumab | INTRAVENOUS | OGIVRI (BLA, Biocon Biologics Inc., 2026-06-26) |
| treprostinil | treprostinil | INTRAVENOUS+SUBCUTANEOUS | Treprostinil (ANDA, Alembic Pharmaceuticals Inc., 2025-02-13) |
| triclabendazole | triclabendazole | ORAL | EGATEN (NDA, Novartis Pharmaceuticals Corporation, 2026-06-04) |
| trimethoprim | trimethoprim | ORAL | Trimethoprim (NDA, Dr. Reddy's Labratories Inc., 2024-01-26) |
| ulipristal | ulipristal acetate | ORAL | Ella (NDA, PMI Branded Pharmaceuticals, Inc., 2026-07-20) |
| unfractionated-heparin | unfractionated heparin | INTRAVENOUS; INTRAVENOUS+SUBCUTANEOUS | Heparin Sodium and Dextrose (NDA, Hospira, Inc., 2026-05-25); Heparin Sodium (NDA, Fresenius Kabi USA, LLC, 2026-04-30) |
| upadacitinib | upadacitinib | ORAL | Rinvoq (NDA, AbbVie Inc., 2026-06-30) |
| ursodeoxycholic-acid | Ursodeoxycholic acid | ORAL | Ursodiol (NDA, Actavis Pharma, Inc., 2023-07-31) |
| ustekinumab | ustekinumab | INTRAVENOUS+SUBCUTANEOUS; SUBCUTANEOUS | Stelara (BLA, Janssen Biotech, Inc., 2026-09-08); Ustekinumab-aekn (BLA, Teva Pharmaceuticals USA, Inc., 2026-07-30) |
| valaciclovir | valaciclovir | ORAL | VALTREX (NDA, GlaxoSmithKline LLC, 2025-11-12) |
| valbenazine | valbenazine | ORAL | INGREZZA (NDA, Neurocrine Biosciences, Inc., 2026-04-17) |
| valganciclovir | Valganciclovir | ORAL | Valcyte (NDA, H2-Pharma, LLC, 2025-12-08) |
| valsartan | valsartan | ORAL | Diovan (NDA, Novartis Pharmaceuticals Corporation, 2026-08-11) |
| vancomycin | vancomycin | INTRAVENOUS; INTRAVENOUS+ORAL; INTRAVITREAL+INTRAVENOUS; ORAL | TYZAVAN (NDA, Hikma Pharmaceuticals USA Inc., 2026-08-19); Vancomycin Hydrochloride (NDA, Avenacy, LLC, 2026-07-31); VANCOMYCIN HYDROCHLORIDE (NDA, Baxter Healthcare Corporation, 2026-06-09); vancomycin hydrochloride (NDA, ANI Pharmaceuticals, Inc., 2026-03-02) |
| varenicline | Varenicline | ORAL | CHANTIX (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-01-23) |
| varenicline-detail | varenicline | ORAL | CHANTIX (NDA, Pfizer Laboratories Div Pfizer Inc, 2026-01-23) |
| vecuronium | vecuronium bromide | INTRAVENOUS | vecuronium bromide (ANDA, Sun Pharmaceutical Industries, Inc., 2026-07-24) |
| vemurafenib | vemurafenib | ORAL | ZELBORAF (NDA, Genentech, Inc., 2026-08-28) |
| venetoclax | venetoclax | ORAL | Venclexta (NDA, AbbVie Inc., 2026-05-20) |
| venlafaxine | venlafaxine | ORAL | venlafaxine (NDA, Almatica Pharma LLC, 2025-10-09) |
| verapamil | verapamil | INTRAVENOUS; ORAL | Verapamil Hydrochloride (NDA, EXELA PHARMA SCIENCES, LLC, 2017-02-21); Verapamil Hydrochloride (NDA, Teva Pharmaceuticals Inc, 2025-09-22) |
| vigabatrin | vigabatrin | ORAL | VIGAFYDE (NDA, Upsher-Smith Laboratories, LLC, 2025-11-01) |
| vilazodone | vilazodone | ORAL | VIIBRYD (NDA, Allergan, Inc., 2023-10-01) |
| vinblastine | vinblastine | INTRAVENOUS | Vinblastine Sulfate (ANDA, Fresenius Kabi USA, LLC, 2025-04-15) |
| vincristine | vincristine | INTRAVENOUS | VinCRIStine Sulfate (ANDA, Hospira, Inc., 2026-02-17) |
| vinorelbine | vinorelbine | INTRAVENOUS | Vinorelbine (ANDA, Sagent Pharmaceuticals, 2024-08-16) |
| voriconazole-detail | voriconazole | INTRAVENOUS; ORAL; ORAL+INTRAVENOUS | VFEND (NDA, Roerig, 2026-03-20); Voriconazole (NDA, Mylan Pharmaceuticals Inc., 2026-06-02); VFEND (NDA, Roerig, 2026-02-26) |
| vortioxetine | vortioxetine | ORAL | Trintellix (NDA, Takeda Pharmaceuticals America, Inc., 2025-03-05) |
| warfarin | warfarin | ORAL | Warfarin Sodium (ANDA, Amneal Pharmaceuticals LLC, 2026-05-29) |
| zanamivir | zanamivir | RESPIRATORY (INHALATION) | RELENZA (NDA, GlaxoSmithKline LLC, 2023-10-24) |
| zidovudine | Zidovudine | ORAL; ORAL+INTRAVENOUS | Zidovudine (ANDA, Aurobindo Pharma Limited, 2025-02-10); RETROVIR (NDA, ViiV Healthcare Company, 2024-11-13) |
| zoledronic-acid | Zoledronic acid | INTRAVENOUS | Reclast (NDA, Sandoz Inc, 2026-02-03) |
| zoledronic-acid-detail | zoledronic acid | INTRAVENOUS | Reclast (NDA, Sandoz Inc, 2026-02-03) |
| zolpidem | zolpidem | ORAL; SUBLINGUAL | zolpidem tartrate (NDA, Almatica Pharma LLC, 2025-10-09); ZOLPIDEM TARTRATE (ANDA, Lupin Pharmaceuticals,Inc., 2020-11-18) |
| zonisamide | zonisamide | ORAL | Zonegran (NDA, Advanz Pharma (US) Corp., 2025-09-12) |
