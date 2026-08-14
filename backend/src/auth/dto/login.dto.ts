import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'ログインIDを入力してください' })
  @MaxLength(100)
  loginId!: string;

  @IsString()
  @IsNotEmpty({ message: 'パスワードを入力してください' })
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @IsNotEmpty({ message: '新しいパスワードを入力してください' })
  @MaxLength(200)
  newPassword!: string;
}
