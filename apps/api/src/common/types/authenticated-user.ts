export interface AuthenticatedUser {
  readonly id: string;
  readonly clerkId: string;
  readonly email: string;
  readonly name: string | null;
  readonly baseCurrency: string;
}
