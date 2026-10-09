import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DesignFunction } from '../entities/design-function.entity';
import { DesignFunctionVersion } from '../entities/design-function-version.entity';
import {
  currentVersionOf,
  parseConstants,
} from '../dtos/design-function-output.dto';
import { CreateDesignFunctionDto } from '../dtos/create-design-function.dto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  CalculateFunctionItemDto,
  FunctionParametersDto,
} from '../dtos/calculate-function.dto';
import { FunctionCalculationResultDto } from '../dtos/calculate-function-response.dto';
import { DesignFunctionDependencyService } from './design-function-dependency.service';

@Injectable()
export class DesignFunctionService {
  private readonly secureFunctionEngineUrl: string;

  constructor(
    @InjectRepository(DesignFunction)
    private readonly designFunctionRepository: Repository<DesignFunction>,
    @InjectRepository(DesignFunctionVersion)
    private readonly versionRepository: Repository<DesignFunctionVersion>,
    private readonly httpService: HttpService,
    private readonly dependencies: DesignFunctionDependencyService,
  ) {
    this.secureFunctionEngineUrl = process.env.SECURE_FUNCTION_ENGINE_URL;
  }

  async create(createDto: CreateDesignFunctionDto): Promise<DesignFunction> {
    // Encrypt sensitive data before saving
    const dataToEncrypt = {
      plainTextFunction: createDto.expression,
    };

    const encryptedDataResponse = await firstValueFrom(
      this.httpService.post(
        `${this.secureFunctionEngineUrl}/function-engine/encrypt`,
        dataToEncrypt,
      ),
    );

    const designFunction = await this.designFunctionRepository.save(
      this.designFunctionRepository.create({
        name: createDto.name,
        description: createDto.description,
        code: createDto.code,
      }),
    );

    // La fórmula nace con su versión 1 ya vigente. Identidad y versión se
    // crean juntas: una fórmula sin versión vigente no se puede evaluar.
    await this.versionRepository.save(
      this.versionRepository.create({
        designFunctionId: designFunction.id,
        version: 1,
        expression: encryptedDataResponse.data.encrypted,
        variables: createDto.variables,
        constants: JSON.stringify(createDto.constants ?? {}),
        isCurrent: true,
      }),
    );

    return designFunction;
  }

  async calculateFunctions(
    functions: CalculateFunctionItemDto[],
  ): Promise<FunctionCalculationResultDto[]> {
    try {
      const calculationPromises = functions.map((func) =>
        this.calculateSingleFunction(func.designFunctionId, func.parameters),
      );

      return Promise.all(calculationPromises);
    } catch (error) {
      throw new Error(`Error calculating functions: ${error.message}`);
    }
  }

  private async calculateSingleFunction(
    designFunctionId: number,
    parameters: FunctionParametersDto,
  ): Promise<FunctionCalculationResultDto> {
    try {
      // La evaluación usa siempre la versión vigente: un diseño calculado
      // con una versión anterior queda marcado como desactualizado, pero un
      // cálculo nuevo se hace con la definición actual de la fórmula.
      const designFunction = await this.designFunctionRepository.findOne({
        where: { id: designFunctionId },
        relations: ['versions'],
      });

      if (!designFunction) {
        throw new Error(
          `Design function with ID ${designFunctionId} not found`,
        );
      }

      const current = currentVersionOf(designFunction);
      if (!current) {
        throw new Error(
          `La fórmula ${designFunctionId} no tiene una versión vigente`,
        );
      }

      const encryptedFunction = current.expression;

      // Las fórmulas que invoca viajan cifradas con ella, con su versión
      // vigente: el motor las resuelve sin que su texto salga de allí.
      const dependencies = DesignFunctionDependencyService.toEngine(
        await this.dependencies.closure(designFunctionId),
      );

      // Call the secure function engine
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.secureFunctionEngineUrl}/function-engine/evaluate-function`,
          {
            encryptedFunction,
            parameters,
            constants: parseConstants(current.constants),
            ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
          },
        ),
      );

      // Add the design function ID to the result
      return {
        designFunctionId,
        ...response.data,
      };
    } catch (error) {
      throw new Error(`Error calling secure function engine: ${error.message}`);
    }
  }
}
