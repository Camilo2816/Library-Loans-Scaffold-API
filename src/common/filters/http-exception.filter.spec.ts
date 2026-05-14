import { ArgumentsHost, BadRequestException, HttpStatus, Logger } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let response: any;
  let host: ArgumentsHost;
  let loggerErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterAll(() => {
    loggerErrorSpy.mockRestore();
  });

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/api/test', method: 'GET' }),
      }),
    } as ArgumentsHost;
  });

  it('serializa HttpException con mensaje string', () => {
    filter.catch(new BadRequestException('mensaje plano'), host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'mensaje plano' }),
    );
  });

  it('serializa HttpException con body objeto (array de mensajes)', () => {
    filter.catch(
      new BadRequestException({ message: ['campo requerido', 'email inválido'], error: 'Bad Request' }),
      host,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['campo requerido', 'email inválido'], error: 'Bad Request' }),
    );
  });

  it('responde con 500 ante errores genéricos (Error)', () => {
    filter.catch(new Error('boom'), host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'boom' }),
    );
  });

  it('responde con 500 ante excepciones no reconocidas', () => {
    filter.catch('error inesperado', host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('incluye timestamp, path y method en la respuesta', () => {
    filter.catch(new BadRequestException('test'), host);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
        path: '/api/test',
        method: 'GET',
      }),
    );
  });
});
