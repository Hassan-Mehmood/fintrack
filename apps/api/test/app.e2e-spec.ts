import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

jest.mock('./../src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {
    onModuleInit(): void {}
    onModuleDestroy(): void {}
  },
}));

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('requires authentication for account balance adjustments', () => {
    return request(app.getHttpServer())
      .post(
        '/api/v1/accounts/ed32ab72-f77e-4eec-a090-db723db0b637/balance-adjustments',
      )
      .send({
        currentBalance: '100',
        expectedBalance: '0',
        currency: 'USD',
        idempotencyKey: 'ed32ab72-f77e-4eec-a090-db723db0b637',
      })
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
