import { PhantomItem } from '../entities/phantom-item.entity';
import { PhantomItemComponent } from '../entities/phantom-item-component.entity';
import {
  PhantomItemComponentOutputDto,
  PhantomItemDetailOutputDto,
  PhantomItemOutputDto,
} from '../dtos/phantom-item-output.dto';
import { calculateLengths, parseFormulaOverrides } from './derived-fields';
import { parseExtraValues } from './extra-values';

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
  extraValues: parseExtraValues(component.extraValues),
});

export const toPhantomItemOutput = (
  phantomItem: PhantomItem,
  componentsCount: number,
): PhantomItemOutputDto => {
  const formulaOverrides = parseFormulaOverrides(phantomItem.formulaOverrides);
  const lengths = calculateLengths({ ...phantomItem, formulaOverrides });

  return {
    id: phantomItem.id,
    processId: phantomItem.processId,
    familyId: phantomItem.familyId ?? null,
    familyName: phantomItem.family?.name ?? null,
    extraValues: parseExtraValues(phantomItem.extraValues),
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
    /**
     * Solo lo que el registro tiene de propio.
     *
     * Antes se rellenaba con la fórmula por defecto de cada longitud, para que
     * el cliente recibiera «la expresión efectiva». Dos problemas. Uno: un
     * override significa «alguien cambió esto», y devolver el valor por
     * defecto con ese nombre borra la distinción. Dos, y es el que se veía:
     * esa fórmula está escrita en el dialecto de este lado —`=LARGO(reference)`,
     * que mide un campo por su nombre porque aquí se calcula sin rejilla— y el
     * editor evalúa referencias de celda. `=LARGO(reference)` no es evaluable
     * allí, así que la fila cargada mostraba `#ERROR` en las tres columnas de
     * longitud mientras las filas añadidas en el editor, con `=LARGO(F2)`,
     * salían bien.
     */
    formulaOverrides,
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
