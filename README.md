<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` | Sí | Conexión a SQL Server. |
| `JWT_SECRET` | Sí | Firma de los tokens de sesión. |
| `SECURE_FUNCTION_ENGINE_URL` | Sí | URL del motor cifrado (`secure-function-engine-api`). Por omisión `http://localhost:5000`. |
| `SFE_SERVICE_SECRET` | Sí en producción | Secreto compartido con el motor cifrado. **Debe coincidir exactamente** con el del otro servicio. Sin él, descifrar una fórmula para editarla responde 401. |
| `EXTERNAL_API_URL`, `API_KEY` | Según integración | Servicio externo. |

## Dependencia del motor de fórmulas

```json
"@rymel/formula-engine": "github:JaviAPS94/rymel-formula-engine#v1.5.0"
```

Se instala fijado a un **tag inmutable**, nunca a `main`: una publicación del
paquete no debe cambiarle el resultado a un repositorio que no la pidió. El
mismo motor lo usan `project-admin` y `project-front`, y esa es la razón de
que exista: el número que calcula el servidor al recalcular un diseño tiene
que ser el mismo que el usuario ve en pantalla.

Al actualizar el tag hay que volver a pasar las verificaciones:

```bash
npx ts-node -r tsconfig-paths/register src/db/scripts/syntax-compatibility-audit.ts
npx ts-node -r tsconfig-paths/register src/db/scripts/differential-formula-check.ts
npx ts-node -r tsconfig-paths/register src/db/scripts/shadow-verification.ts informe.md
```

## Scripts de mantenimiento

En `src/db/scripts/`. Ninguno escribe sin `--aplicar` salvo que se indique.

| Script | Qué hace |
|---|---|
| `syntax-compatibility-audit.ts` | Contrasta la sintaxis que acepta el motor contra la del evaluador anterior de project-front. |
| `differential-formula-check.ts` | Compara el motor con el evaluador anterior sobre un corpus de fórmulas. |
| `shadow-verification.ts` | Reevalúa todos los sub-diseños y difunde contra los valores guardados. |
| `dry-run-recalculation.ts` | Simula el recálculo de los diseños desactualizados sin escribir. |
| `check-version-service.ts` | Verificación de integración del versionado de fórmulas. |
| `check-recalculation.ts` | Verificación del recálculo sobre un sub-diseño, restaurando su estado. |
| `fix-implicit-multiplication.ts` | Corrección puntual ya aplicada: multiplicación implícita en las constantes. |
| `fix-sub-design-74-reference.ts` | Corrección puntual ya aplicada: referencia a la etiqueta en vez del valor. |
