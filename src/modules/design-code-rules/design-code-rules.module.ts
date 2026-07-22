import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesignCodeRulesController } from './design-code-rules.controller';
import { DesignCodePowerLetter } from './entities/design-code-power-letter.entity';
import { DesignCodePrimaryTensionLetter } from './entities/design-code-primary-tension-letter.entity';
import { DesignCodeSecondaryTensionLetter } from './entities/design-code-secondary-tension-letter.entity';
import { DesignCodeSapSegmentMapping } from './entities/design-code-sap-segment-mapping.entity';
import { DesignCodeSuffixFormat } from './entities/design-code-suffix-format.entity';
import { DesignCodePowerLetterService } from './services/design-code-power-letter.service';
import { DesignCodePrimaryTensionLetterService } from './services/design-code-primary-tension-letter.service';
import { DesignCodeSecondaryTensionLetterService } from './services/design-code-secondary-tension-letter.service';
import { DesignCodeSapSegmentMappingService } from './services/design-code-sap-segment-mapping.service';
import { DesignCodeSuffixFormatService } from './services/design-code-suffix-format.service';
import { DesignCodeGenerationService } from './services/design-code-generation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DesignCodePowerLetter,
      DesignCodePrimaryTensionLetter,
      DesignCodeSecondaryTensionLetter,
      DesignCodeSapSegmentMapping,
      DesignCodeSuffixFormat,
    ]),
  ],
  controllers: [DesignCodeRulesController],
  providers: [
    DesignCodePowerLetterService,
    DesignCodePrimaryTensionLetterService,
    DesignCodeSecondaryTensionLetterService,
    DesignCodeSapSegmentMappingService,
    DesignCodeSuffixFormatService,
    DesignCodeGenerationService,
  ],
  exports: [DesignCodeGenerationService],
})
export class DesignCodeRulesModule {}
