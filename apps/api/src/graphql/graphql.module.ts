import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { GraphqlController } from './graphql.controller';

@Module({
  imports: [AuthModule, ContentModule],
  controllers: [GraphqlController],
})
export class GraphqlModule {}
