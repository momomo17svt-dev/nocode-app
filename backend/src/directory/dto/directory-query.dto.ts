import { IsOptional, IsString, IsInt, IsIn, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ディレクトリ（指定ユーザー/グループの選択）取得条件。
 * - パラメータ無し: 全件返却（既存画面のラベル解決用、後方互換）。
 * - q 指定: 部分一致検索（take件まで）。15万/2万件をクライアントに展開しないため。
 * - ids 指定: カンマ区切りIDの解決（選択済みの表示名復元用）。
 * - scope=mygroups: ユーザー検索を「自分の所属部署＋配下部署のメンバー」に限定。特権ロールは無視して全件対象。
 */
export class DirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  ids?: string;

  @IsOptional()
  @IsIn(['mygroups'])
  scope?: string;
}
