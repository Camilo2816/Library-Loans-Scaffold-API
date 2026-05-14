import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let loggerLogSpy: jest.SpyInstance;

  beforeAll(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterAll(() => {
    loggerLogSpy.mockRestore();
  });

  it('deja pasar el valor de respuesta sin modificarlo', (done) => {
    const interceptor = new LoggingInterceptor();
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url: '/api/items' }) }),
    } as ExecutionContext;
    const handler: CallHandler = { handle: () => of('response-value') };

    interceptor.intercept(ctx, handler).subscribe({
      next: (val) => {
        expect(val).toBe('response-value');
        done();
      },
    });
  });

  it('llama al logger al completar la solicitud', (done) => {
    const interceptor = new LoggingInterceptor();
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ method: 'POST', url: '/api/loans' }) }),
    } as ExecutionContext;
    const handler: CallHandler = { handle: () => of(null) };

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        expect(loggerLogSpy).toHaveBeenCalled();
        done();
      },
    });
  });
});
