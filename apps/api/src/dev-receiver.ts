import { Body, Controller, InternalServerErrorException, NotFoundException, Param, Post } from '@nestjs/common';
import { config } from './config';

@Controller('dev/receiver')
export class DevReceiverController {
  @Post(':mode')
  async receive(@Param('mode') mode: string, @Body() body: unknown) {
    if (config().NODE_ENV === 'production') throw new NotFoundException();
    if (mode === 'timeout') await new Promise((resolve) => setTimeout(resolve, config().WEBHOOK_TIMEOUT_MS + 2000));
    if (mode === '500') throw new InternalServerErrorException({ message: 'Simulated failure', received: body });
    return { received: true, body };
  }
}
