import { INestApplication } from '@nestjs/common';
import { json } from 'express';

export const PASTE_ROUTE = '/phantom-items/import/paste';

/**
 * Pasting a whole process from Excel (METALMECANICA, 2,642 lines) is about
 * 0.5 MB, over Express's default 100 KB. This widens the JSON limit for that
 * route only. Call it before `listen`: Nest adds its own parser on init.
 *
 * Wrapped under another name on purpose: Nest skips its global JSON parser if
 * it finds a middleware called `jsonParser` already registered, and then no
 * other route receives its JSON body (the design list, every save…).
 */
export const usePasteBodyParser = (app: INestApplication): void => {
  const parser = json({ limit: '10mb' });
  app.use(PASTE_ROUTE, function phantomPasteJsonParser(req, res, next) {
    parser(req, res, next);
  });
};
