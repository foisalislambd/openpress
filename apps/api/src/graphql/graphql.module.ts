import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { GraphqlController } from './graphql.controller';

@Module({
  imports: [ContentModule],
  controllers: [GraphqlController],
})
export class GraphqlModule {}
