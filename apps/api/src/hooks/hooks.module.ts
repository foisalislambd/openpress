import { Global, Module } from '@nestjs/common';
import { ExtensionRegistry } from '../extensions/extension-registry';
import { HooksService } from './hooks.service';

@Global()
@Module({
  providers: [HooksService, ExtensionRegistry],
  exports: [HooksService, ExtensionRegistry],
})
export class HooksModule {}
