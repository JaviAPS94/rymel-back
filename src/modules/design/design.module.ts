import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesignController } from './design.controller';
import { DesignTypeService } from './services/design-type.service';
import { DesignSubTypeService } from './services/design-subtype.service';
import { DesignType } from './entities/design-type.entity';
import { DesignSubType } from './entities/design-subtype.entity';
import { DesignFunction } from './entities/design-function.entity';
import { DesignFunctionVersion } from './entities/design-function-version.entity';
import { DesignFunctionAccessLog } from './entities/design-function-access-log.entity';
import { DesignFunctionVersionService } from './services/design-function-version.service';
import { SecureFunctionEngineClient } from './services/secure-function-engine.client';
import { DesignFunctionAdminService } from './services/design-function-admin.service';
import { DesignFunctionAdminController } from './design-function-admin.controller';
import { DesignSubTypeFunction } from './entities/design-subtype-function.entity';
import { SubDesign } from './entities/sub-design.entity';
import { SubDesignRecalculation } from './entities/sub-design-recalculation.entity';
import { DesignRecalculationService } from './services/design-recalculation.service';
import { DesignFunctionService } from './services/design-function.service';
import { DesignFunctionController } from './design-function.controller';
import { HttpModule } from '@nestjs/axios';
import { TemplateService } from './services/template.service';
import { Template } from './entities/template.entity';
import { Sheet } from './entities/sheet.entity';
import { TemplateDraft } from './entities/template-draft.entity';
import { TemplateRevision } from './entities/template-revision.entity';
import { TemplateAdminService } from './services/template-admin.service';
import { TemplateAdminController } from './template-admin.controller';
import { DesignService } from './services/design.service';
import { DesignCodeRulesModule } from '../design-code-rules/design-code-rules.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      DesignType,
      DesignSubType,
      DesignFunction,
      DesignFunctionVersion,
      DesignFunctionAccessLog,
      DesignSubTypeFunction,
      SubDesign,
      SubDesignRecalculation,
      Template,
      Sheet,
      TemplateDraft,
      TemplateRevision,
    ]),
    DesignCodeRulesModule,
  ],
  controllers: [
    DesignController,
    DesignFunctionController,
    DesignFunctionAdminController,
    TemplateAdminController,
  ],
  providers: [
    DesignTypeService,
    DesignSubTypeService,
    DesignFunctionService,
    DesignFunctionVersionService,
    SecureFunctionEngineClient,
    DesignFunctionAdminService,
    DesignRecalculationService,
    TemplateService,
    TemplateAdminService,
    DesignService,
  ],
  exports: [
    DesignTypeService,
    DesignSubTypeService,
    DesignFunctionService,
    DesignFunctionVersionService,
    SecureFunctionEngineClient,
    DesignFunctionAdminService,
    DesignRecalculationService,
    TemplateService,
    TemplateAdminService,
    DesignService,
  ],
})
export class DesignModule {}
