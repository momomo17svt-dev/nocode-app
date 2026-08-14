import { IsString, IsNotEmpty, IsArray, IsOptional, MaxLength } from 'class-validator';

export class RemindDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  /** 催促を送る受信者（ユーザーID）の配列。 */
  @IsArray()
  userIds!: string[];

  @IsOptional()
  @IsString()
  recordId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
