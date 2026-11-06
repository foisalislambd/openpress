import { Global, Module } from '@nestjs/common';
import { CoreRegistry } from '../core/core-registry';
import { ExtensionRegistry } from '../extensions/extension-registry';
import { HooksService } from './hooks.service';

@Global()
@Module({
  providers: [HooksService, ExtensionRegistry, CoreRegistry],
  exports: [HooksService, ExtensionRegistry, CoreRegistry],
})
export class HooksModule {}
