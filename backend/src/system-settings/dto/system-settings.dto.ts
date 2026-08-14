import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpdateAuthPolicyDto {
  @IsInt() @Min(3) @Max(20)
  maxFailedAttempts!: number;

  @IsInt() @Min(1) @Max(1_440)
  lockoutMinutes!: number;

  @IsInt() @Min(1) @Max(1_440)
  attemptWindowMinutes!: number;

  @IsInt() @Min(1) @Max(168)
  sessionHours!: number;

  @IsInt() @Min(8) @Max(64)
  passwordMinLength!: number;
}

export class UpdateBackupPolicyDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt() @Min(0) @Max(23)
  hour!: number;

  @IsInt() @Min(1) @Max(365)
  retentionDays!: number;
}

export class CreateApiTokenDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @IsUUID()
  ownerId!: string;

  @IsOptional() @IsBoolean()
  readOnly?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(365)
  expiresInDays?: number;
}
