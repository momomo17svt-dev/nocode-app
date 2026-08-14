import { IsObject } from 'class-validator';

export class PublicSubmitDto {
  @IsObject()
  data!: Record<string, any>;
}
