import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

/** One downloadable weight file in a model manifest. */
export interface ModelFile {
  /** Role of the file within the runtime. */
  role: 'model' | 'mmproj';
  /** File name as stored at the distribution origin. */
  name: string;
  /** Absolute download URL. */
  url: string;
  /** Size in bytes — lets the app show a progress bar + pre-flight disk check. */
  sizeBytes: number;
  /**
   * Lowercase hex SHA-256 of the file. The app MUST verify this after
   * download before loading the weights. Empty string means the operator
   * has not yet published a digest for this build (download still works,
   * integrity check is skipped with a warning).
   */
  sha256: string;
}

/**
 * Manifest for an on-device model build. This is the contract the
 * VedaMD mobile app reads to download + verify + load the assistant
 * model while online, so it can then run fully offline.
 */
export interface ModelManifest {
  /** Stable model family id. */
  id: 'medgemma-4b-multimodal';
  /** Human-facing name. */
  displayName: string;
  /** Immutable build id, e.g. "medgemma-4b-it-q4_k_m". */
  version: string;
  /** Inference runtime the files target. */
  runtime: 'llama.cpp';
  /** On-disk weight format. */
  format: 'gguf';
  /** Quantisation tag, e.g. "Q4_K_M". */
  quantization: string;
  /** Whether the build accepts image input (MedGemma 4B is multimodal). */
  multimodal: boolean;
  /** Weight files to download, in load order. */
  files: ModelFile[];
  /** Sum of all file sizes — what the app must download in total. */
  totalSizeBytes: number;
  /** Native context window. */
  contextLength: number;
  /** ISO publish date. */
  releasedAt: string;
  /** Lowest mobile app version permitted to run this build. */
  minAppVersion: string;
  /**
   * Licence the clinician implicitly accepts by downloading. MedGemma is
   * released under the Health AI Developer Foundations terms (built on
   * Gemma). Surfaced so the app can show + record acceptance.
   */
  license: {
    name: string;
    url: string;
  };
  /** Recommended sampling defaults for clinical determinism. */
  inferenceDefaults: {
    temperature: number;
    topP: number;
    maxTokens: number;
  };
}

@Injectable()
export class ModelsService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private cfg() {
    return this.config.get('models', { infer: true });
  }

  private fileUrl(name: string): string {
    const base = this.cfg().distributionBaseUrl.replace(/\/+$/, '');
    const version = this.cfg().medgemmaVersion;
    return `${base}/medgemma/${version}/${name}`;
  }

  /**
   * Manifest for the current MedGemma 4B multimodal mobile build.
   * Served at `/v1/models/medgemma/current`.
   */
  medgemmaCurrent(): ModelManifest {
    const c = this.cfg();
    const files: ModelFile[] = [
      {
        role: 'model',
        name: c.medgemmaModelFile,
        url: this.fileUrl(c.medgemmaModelFile),
        sizeBytes: c.medgemmaModelSizeBytes,
        sha256: c.medgemmaModelSha256,
      },
      {
        role: 'mmproj',
        name: c.medgemmaMmprojFile,
        url: this.fileUrl(c.medgemmaMmprojFile),
        sizeBytes: c.medgemmaMmprojSizeBytes,
        sha256: c.medgemmaMmprojSha256,
      },
    ];
    return {
      id: 'medgemma-4b-multimodal',
      displayName: 'MedGemma 4B (multimodal, on-device)',
      version: c.medgemmaVersion,
      runtime: 'llama.cpp',
      format: 'gguf',
      quantization: c.medgemmaQuantization,
      multimodal: true,
      files,
      totalSizeBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
      contextLength: c.medgemmaContextLength,
      releasedAt: c.medgemmaReleasedAt,
      minAppVersion: c.medgemmaMinAppVersion,
      license: {
        name: 'Health AI Developer Foundations Terms of Use (Gemma)',
        url: 'https://developers.google.com/health-ai-developer-foundations/terms',
      },
      inferenceDefaults: {
        temperature: 0.1,
        topP: 0.95,
        maxTokens: 1024,
      },
    };
  }

  /** Catalog of every on-device model VedaMD distributes. */
  list(): ModelManifest[] {
    return [this.medgemmaCurrent()];
  }
}
