import { Body, Controller, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PASTE_ROUTE, usePasteBodyParser } from './paste-body-parser';

@Controller()
class EchoController {
  @Post('design/by-filters-paginated')
  designs(@Body() body: unknown) {
    return body ?? null;
  }

  @Post(PASTE_ROUTE.slice(1))
  paste(@Body() body: { text?: string }) {
    return { length: body?.text?.length ?? 0 };
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

describe('usePasteBodyParser', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EchoModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // As main.ts does: before init, which is when Nest adds its parser
    usePasteBodyParser(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('regression: the other routes still receive their JSON body', async () => {
    // With the scoped parser named `jsonParser`, Nest skipped its own and the
    // admin's design list arrived without page/limit (skip = NaN)
    const response = await request(app.getHttpServer())
      .post('/design/by-filters-paginated')
      .send({ page: 1, limit: 10 });

    expect(response.body).toEqual({ page: 1, limit: 10 });
  });

  it('accepts a pasted sheet bigger than the default 100 KB', async () => {
    const text = 'x'.repeat(600_000);

    const response = await request(app.getHttpServer())
      .post(PASTE_ROUTE)
      .send({ text });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ length: 600_000 });
  });

  it('keeps the default limit elsewhere', async () => {
    const response = await request(app.getHttpServer())
      .post('/design/by-filters-paginated')
      .send({ text: 'x'.repeat(600_000) });

    expect(response.status).toBe(413);
  });
});
