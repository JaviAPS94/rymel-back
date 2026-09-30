/**
 * Cliente del motor cifrado.
 *
 * Concentra en un solo sitio el transporte, el secreto servicio-a-servicio y
 * el trato de los fallos. Antes cada llamada armaba su propio `httpService
 * .post` y dejaba que el error de axios subiera tal cual, con la URL interna
 * del motor dentro del mensaje.
 *
 * El descifrado es la operación delicada: es la única que devuelve el activo
 * que el motor protege. Aquí se le añade el secreto compartido y el
 * identificador de correlación que permite seguir el acceso hasta el usuario
 * que lo pidió.
 */

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  symbols?: string[];
  functions?: string[];
  /** Otras fórmulas que invoca, por código. */
  formulas?: string[];
  /** Cada invocación a otra fórmula con cuántos argumentos recibe. */
  formulaCalls?: { name: string; argCount: number }[];
}

/** Una fórmula invocada, como la espera el motor en `dependencies`. */
export interface EngineDependency {
  encryptedFunction: string;
  variables: string[];
  constants: Record<string, number>;
}

@Injectable()
export class SecureFunctionEngineClient {
  private readonly logger = new Logger(SecureFunctionEngineClient.name);
  private readonly baseUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl =
      process.env.SECURE_FUNCTION_ENGINE_URL ?? 'http://localhost:5000';
  }

  /** Cifra una expresión ya validada. */
  async encrypt(plainTextFunction: string): Promise<string> {
    const data = await this.post<{ encrypted: string }>('encrypt', {
      plainTextFunction,
    });
    return data.encrypted;
  }

  /**
   * Descifra una expresión. Solo debe llamarse en nombre de un administrador
   * y con el acceso ya registrado por quien la invoca.
   */
  async decrypt(
    encryptedFunction: string,
    correlationId: string,
  ): Promise<string> {
    const data = await this.post<{ plainTextFunction: string }>(
      'decrypt',
      { encryptedFunction },
      correlationId,
    );
    return data.plainTextFunction;
  }

  /** Valida una expresión y devuelve los símbolos que usa. No persiste nada. */
  validate(plainTextFunction: string): Promise<ValidationResult> {
    return this.post<ValidationResult>('validate', { plainTextFunction });
  }

  /**
   * Evalúa una expresión cifrada. `dependencies` es el cierre de fórmulas
   * que invoca, por código: el motor las descifra y las resuelve él, sin que
   * su texto salga de allí.
   */
  async evaluate(
    encryptedFunction: string,
    parameters: Record<string, number>,
    constants: Record<string, number>,
    dependencies: Record<string, EngineDependency> = {},
  ): Promise<number> {
    const data = await this.post<{ result: number }>('evaluate-function', {
      encryptedFunction,
      parameters,
      constants,
      // Sin dependencias no se envía el campo: un motor anterior lo ignoraría
      // igual, pero así la petición es la de siempre.
      ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    });
    return data.result;
  }

  /**
   * Qué fórmulas invoca una expresión ya cifrada, sin pedir su texto. Exige
   * el secreto servicio-a-servicio.
   */
  async invokedFormulas(
    encryptedFunction: string,
  ): Promise<{ name: string; argCount: number }[]> {
    const data = await this.post<{
      formulaCalls: { name: string; argCount: number }[];
    }>('invoked-formulas', { encryptedFunction });
    return data.formulaCalls;
  }

  private async post<T>(
    route: string,
    body: unknown,
    correlationId?: string,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(
          `${this.baseUrl}/function-engine/${route}`,
          body,
          {
            headers: {
              ...(process.env.SFE_SERVICE_SECRET
                ? { 'x-service-secret': process.env.SFE_SERVICE_SECRET }
                : {}),
              ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      throw this.translate(route, error);
    }
  }

  /**
   * Traduce el fallo del motor a algo que el administrador pueda entender,
   * sin filtrar la URL interna ni el detalle del transporte.
   *
   * Distinguir "el motor rechazó la fórmula" de "el motor no responde"
   * importa: lo primero se corrige editando, lo segundo esperando.
   */
  private translate(route: string, error: unknown): Error {
    const axiosError = error as AxiosError<{ message?: string }>;

    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.response.data?.message;

      if (status === 401) {
        this.logger.error(
          `El motor cifrado rechazó la autenticación servicio-a-servicio en "${route}". ` +
            `Revisa SFE_SERVICE_SECRET en ambos servicios.`,
        );
        return new ServiceUnavailableException(
          'El servicio de fórmulas no está disponible en este momento',
        );
      }

      if (status >= 400 && status < 500) {
        return new BadRequestException(
          message ?? 'El motor de fórmulas rechazó la operación',
        );
      }
    }

    this.logger.error(
      `El motor cifrado no respondió en "${route}": ${axiosError.message}`,
    );
    return new ServiceUnavailableException(
      'El servicio de fórmulas no está disponible en este momento',
    );
  }
}
