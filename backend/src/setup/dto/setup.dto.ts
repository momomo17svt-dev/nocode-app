import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateFirstAdminDto {
  @IsString()
  @IsNotEmpty({ message: 'ログインIDを入力してください' })
  @MaxLength(100)
  loginId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsNotEmpty({ message: 'パスワードを入力してください' })
  @MaxLength(200)
  password!: string;
}
