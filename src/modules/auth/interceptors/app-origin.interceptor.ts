import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { App } from '../enums/app.enum';

@Injectable()
export class AppOriginInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const origin = request.headers.origin || request.headers.referer;
    console.log('Request origin:', origin);

    // If app is not provided in body, set it based on origin
    if (request.body && !request.body.app) {
      if (origin && origin.includes('localhost:5173')) {
        request.body.app = App.ADMIN;
      } else {
        request.body.app = App.CLIENT;
      }
    }

    return next.handle();
  }
}
