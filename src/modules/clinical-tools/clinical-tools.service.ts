import { Injectable } from '@nestjs/common';
import { CLINICAL_TOOLS_DATA } from './clinical-tools.data';
import type { ClinicalToolsResponse, ScoringSystem } from './clinical-tools.types';

@Injectable()
export class ClinicalToolsService {
  all(): ClinicalToolsResponse {
    return CLINICAL_TOOLS_DATA;
  }

  scoringSystem(id: string): ScoringSystem | null {
    return CLINICAL_TOOLS_DATA.scoringSystems.find((s) => s.id === id) ?? null;
  }
}
