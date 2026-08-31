import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { NotificationsService } from './notifications.service';
import type { ChannelCreateDto, ChannelTestDto, ChannelUpdateDto } from './notifications.types';

type OperatorRequest = FastifyRequest & {
  operator?: { integratorId: string; userId?: string };
};

@ApiTags('notifications')
@Controller('v1/notifications/channels')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get('providers')
  @ApiOperation({
    summary: 'List supported notification providers',
    description:
      'Returns the provider identifiers the platform supports (twilio-sms, twilio-whatsapp, africastalking-sms, smtp, whatsapp-business). Used by the UI channel-create form to populate the provider picker.',
  })
  providers() {
    return { providers: this.svc.listProviders() };
  }

  @Get()
  @ApiOperation({
    summary: 'List configured notification channels for the calling integrator',
  })
  list(@Req() req: OperatorRequest) {
    return { channels: this.svc.list(req.operator!.integratorId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single channel (summary only — credentials never returned)' })
  async get(@Param('id') id: string, @Req() req: OperatorRequest) {
    const found = await this.svc.get(req.operator!.integratorId, id);
    if (!found) throw new BadRequestException(`Channel not found: ${id}`);
    return found;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a notification channel',
    description:
      'Submit provider + credentials. Credentials are AEAD-encrypted with the integratorId as additional authenticated data and never returned over the API. A channel must be tested via POST /:id/test before it can dispatch real alerts.',
  })
  async create(@Body() dto: ChannelCreateDto, @Req() req: OperatorRequest) {
    if (!dto.name || !dto.provider || !dto.credentials) {
      throw new BadRequestException('name, provider, and credentials are required.');
    }
    return this.svc.create(req.operator!.integratorId, dto, req.operator!.userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update channel name / recipient / sender / enabled status, OR rotate credentials',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: ChannelUpdateDto,
    @Req() req: OperatorRequest,
  ) {
    return this.svc.update(req.operator!.integratorId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a channel' })
  async remove(@Param('id') id: string, @Req() req: OperatorRequest) {
    const ok = await this.svc.remove(req.operator!.integratorId, id);
    if (!ok) throw new BadRequestException(`Channel not found: ${id}`);
    return { deleted: true };
  }

  @Post(':id/test')
  @ApiOperation({
    summary: 'Send a test message through this channel',
    description:
      'Uses the channel default recipient unless `to` is provided. Sends a short canned message unless `body` is provided. Returns the provider delivery result.',
  })
  async test(@Param('id') id: string, @Body() dto: ChannelTestDto, @Req() req: OperatorRequest) {
    return this.svc.send(req.operator!.integratorId, {
      channelId: id,
      to: dto.to,
      body:
        dto.body ??
        'VedaMD test alert — this confirms your channel is configured correctly. No patient data has been transmitted.',
    });
  }
}
