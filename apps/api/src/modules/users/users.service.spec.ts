import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('UsersService', () => {
  let usersService: UsersService;
  const userUpsert = jest.fn();

  beforeEach(async () => {
    userUpsert.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              upsert: userUpsert,
            },
          },
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  it('upserts a local user from the Clerk profile', async () => {
    const localUser = {
      id: '67d8997f-4af9-4038-bcfe-f9951d31d352',
      clerkId: 'user_2abc',
      email: 'person@example.com',
      name: 'Person Example',
      baseCurrency: 'USD',
    };

    userUpsert.mockResolvedValue(localUser);

    await expect(
      usersService.upsertFromClerkProfile({
        clerkId: 'user_2abc',
        email: 'person@example.com',
        name: 'Person Example',
      }),
    ).resolves.toEqual(localUser);

    expect(userUpsert).toHaveBeenCalledWith({
      where: {
        clerkId: 'user_2abc',
      },
      update: {
        email: 'person@example.com',
        name: 'Person Example',
      },
      create: {
        clerkId: 'user_2abc',
        email: 'person@example.com',
        name: 'Person Example',
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
        baseCurrency: true,
      },
    });
  });
});
