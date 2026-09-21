import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreGrowth, type LmsTable, type Sex, type ZScoreResult } from './zscore';

const LMS_DIR = resolve(process.cwd(), 'content/growth/lms');

/**
 * WHO/CDC growth standards, loaded from the draft lane at content/growth/.
 *
 * The tables are NOT part of the signed bundle: they are fetched by
 * `npm run growth:ingest` and reviewed before promotion, the same posture as
 * content/labels/. When they are absent every lookup reports the indicator
 * as unavailable rather than guessing — a z-score is a number a clinician
 * acts on, and an invented one is worse than none.
 */
@Injectable()
export class GrowthService {
  private readonly log = new Logger(GrowthService.name);
  private readonly tables = new Map<string, LmsTable>();

  constructor() {
    this.load();
  }

  private load(): void {
    if (!existsSync(LMS_DIR)) {
      this.log.warn(
        'No growth standards present (content/growth/lms). Run `npm run growth:ingest`; z-score lookups will report the indicator as unavailable until then.',
      );
      return;
    }
    for (const file of readdirSync(LMS_DIR).filter((f) => f.endsWith('.json'))) {
      try {
        const t = JSON.parse(readFileSync(resolve(LMS_DIR, file), 'utf8')) as LmsTable;
        if (!Array.isArray(t.points) || t.points.length === 0) continue;
        this.tables.set(key(t.indicator, t.sex), t);
      } catch (err) {
        // One malformed file must not take the others down with it.
        this.log.error(`Ignoring unreadable growth standard ${file}: ${(err as Error).message}`);
      }
    }
    this.log.log(`Loaded ${this.tables.size} growth standard table(s).`);
  }

  available(): Array<{ indicator: string; sex: string; xUnit: string; points: number }> {
    return [...this.tables.values()].map((t) => ({
      indicator: t.indicator,
      sex: t.sex,
      xUnit: t.xUnit,
      points: t.points.length,
    }));
  }

  /**
   * Score a measurement. `x` is age in months, or length/height in cm for
   * the weight-for-length standards — the table states which, and a
   * mismatch is rejected rather than silently scored against the wrong axis.
   */
  score(
    indicator: string,
    sex: Sex,
    x: number,
    value: number,
  ): { result: ZScoreResult } | { unavailable: string } {
    const table = this.tables.get(key(indicator, sex));
    if (!table) {
      return {
        unavailable: `No ${indicator} standard loaded for ${sex}. Run \`npm run growth:ingest\`.`,
      };
    }
    const result = scoreGrowth(table, x, value);
    if (!result) {
      const lo = table.points[0].x;
      const hi = table.points[table.points.length - 1].x;
      return {
        unavailable: `The ${indicator} standard covers ${lo}-${hi} ${table.xUnit}; ${x} is outside it.`,
      };
    }
    return { result };
  }
}

function key(indicator: string, sex: string): string {
  return `${indicator.toLowerCase()}:${sex.toLowerCase()}`;
}
