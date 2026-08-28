import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import {
  PhantomItemComponentOutputDto,
  PhantomItemDetailOutputDto,
  PhantomItemOutputDto,
} from '../dtos/phantom-item-output.dto';
import {
  calculateLengths,
  getDefaultLengthFormula,
  parseFormulaOverrides,
} from './derived-fields';
import {
  PHANTOM_ITEM_COLUMNS,
  PhantomItemFieldScope,
} from '../constants/phantom-item-columns';

/**
 * Fills in the record's own formulas with the default ones, so the client
 * always receives the effective expression of each derived field.
 */
const buildEffectiveFormulaOverrides = (own: Record<string, string>) => {
  const effective = { ...own };
  PHANTOM_ITEM_COLUMNS.filter(
    (column) => column.scope === PhantomItemFieldScope.LENGTH,
  ).forEach((column) => {
    if (!effective[column.field]) {
      effective[column.field] = getDefaultLengthFormula(column.field);
    }
  });
  return effective;
};

export const toComponentOutput = (
  component: PhantomItemComponent,
): PhantomItemComponentOutputDto => ({
  id: component.id,
  sortOrder: component.sortOrder,
  componentItemCode: component.componentItemCode,
  description: component.description,
  baseQuantity: component.baseQuantity,
  requiredQuantity: component.requiredQuantity,
  requiredQuantityPerUnit: component.requiredQuantityPerUnit,
  componentUnitOfMeasure: component.componentUnitOfMeasure,
  wastePercentage: component.wastePercentage,
  consumptionWarehouse: component.consumptionWarehouse,
  formulaOverrides: parseFormulaOverrides(component.formulaOverrides),
});

export const toPhantomItemOutput = (
  phantomItem: PhantomItem,
  componentsCount: number,
): PhantomItemOutputDto => {
  const formulaOverrides = parseFormulaOverrides(phantomItem.formulaOverrides);
  const lengths = calculateLengths({ ...phantomItem, formulaOverrides });

  return {
    id: phantomItem.id,
    finishedProductType: phantomItem.finishedProductType,
    workInProcessType: phantomItem.workInProcessType,
    phantomRootCode: phantomItem.phantomRootCode,
    kvaRatingStandard: phantomItem.kvaRatingStandard,
    itemCode: phantomItem.itemCode,
    reference: phantomItem.reference,
    itemDescription: phantomItem.itemDescription,
    shortDescription: phantomItem.shortDescription,
    unitOfMeasure: phantomItem.unitOfMeasure,
    referenceLengthLimit: phantomItem.referenceLengthLimit,
    referenceLength: lengths.referenceLength,
    itemDescriptionLength: lengths.itemDescriptionLength,
    shortDescriptionLength: lengths.shortDescriptionLength,
    formulaOverrides: buildEffectiveFormulaOverrides(formulaOverrides),
    componentsCount,
  };
};

export const toPhantomItemDetailOutput = (
  phantomItem: PhantomItem,
): PhantomItemDetailOutputDto => {
  const components = (phantomItem.components ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    ...toPhantomItemOutput(phantomItem, components.length),
    components: components.map(toComponentOutput),
  };
};
