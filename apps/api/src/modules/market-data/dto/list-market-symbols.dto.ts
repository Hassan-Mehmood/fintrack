import { IsIn } from 'class-validator';

export class ListMarketSymbolsDto {
  @IsIn(['PSX'])
  exchange!: 'PSX';
}
