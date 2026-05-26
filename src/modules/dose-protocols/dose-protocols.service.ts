import { Injectable } from '@nestjs/common';
import data from './data.json';
import type { DoseProtocol } from './dose-protocols.types';

interface ListFilters {
  q?: string;
  diagnosis?: string;
}

export interface DoseProtocolsResponse {
  diagnoses: string[];
  protocols: DoseProtocol[];
}

const PROTOCOLS: DoseProtocol[] = data as DoseProtocol[];

const DIAGNOSES = [...new Set(PROTOCOLS.map((p) => p.diagnosis))].sort((a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }),
);

@Injectable()
export class DoseProtocolsService {
  list(filters: ListFilters = {}): DoseProtocolsResponse {
    const needle = filters.q?.toLowerCase().trim();
    const dxNeedle = filters.diagnosis?.toLowerCase().trim();
    const filtered = PROTOCOLS.filter((p) => {
      if (
        dxNeedle &&
        p.diagnosis.toLowerCase() !== dxNeedle &&
        !p.diagnosis.toLowerCase().includes(dxNeedle)
      ) {
        return false;
      }
      if (needle) {
        const hay = [p.diagnosis, p.line, p.medication, p.preparation, p.remarks ?? '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const diagnoses = [...new Set(filtered.map((p) => p.diagnosis))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    return { diagnoses, protocols: filtered };
  }

  /** Diagnosis list only — used by the Catalogue stats card. */
  diagnoses(): string[] {
    return DIAGNOSES;
  }
}
