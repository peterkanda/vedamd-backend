import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContentDistributionService } from './content-distribution.service';

/**
 * Offline content sync (FR-150). The mobile app ships every bundle as a
 * baked-in asset so it works offline on first launch, then uses these
 * endpoints to refresh to the latest signed content whenever it next
 * has connectivity.
 */
@ApiTags('content')
@Controller('v1/content')
export class ContentDistributionController {
  constructor(private readonly content: ContentDistributionService) {}

  @Get('manifest')
  @ApiOperation({
    summary: 'Signed content bundle manifest',
    description: 'Version + per-file SHA-256 + sizes for offline sync.',
  })
  manifest() {
    return this.content.manifest();
  }

  @Get('signature')
  @ApiOperation({ summary: 'Ed25519 signature over the manifest' })
  @Header('content-type', 'application/octet-stream')
  signature() {
    return new StreamableFile(this.content.manifestSignature());
  }

  @Get('public-key')
  @ApiOperation({ summary: 'Ed25519 public key (PEM) for signature verification' })
  @Header('content-type', 'application/x-pem-file')
  publicKey() {
    return this.content.publicKeyPem();
  }

  @Get('bundles/:file')
  @ApiOperation({
    summary: 'Raw bytes of one bundle file',
    description: 'Exact signed bytes — the app verifies SHA-256 against the manifest.',
  })
  @Header('content-type', 'application/json')
  @Header('cache-control', 'public, max-age=3600')
  bundle(@Param('file') file: string) {
    const { stream } = this.content.fileStream(file);
    return new StreamableFile(stream);
  }
}
