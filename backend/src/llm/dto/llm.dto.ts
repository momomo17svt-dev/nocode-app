import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/** AI設定（接続情報・インデックス対象）の更新。すべて任意で部分更新可能。 */
export class UpdateLlmConfigDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsIn(['lmstudio', 'ollama', 'openai', 'openrouter', 'groq', 'gemini', 'mistral', 'custom'])
  provider?: 'lmstudio' | 'ollama' | 'openai' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'custom';

  @IsOptional() @IsString()
  baseUrl?: string;

  @IsOptional() @IsString()
  apiKey?: string;

  @IsOptional() @IsIn(['authorization', 'api-key', 'x-api-key'])
  apiKeyHeader?: 'authorization' | 'api-key' | 'x-api-key';

  @IsOptional() @IsBoolean()
  clearApiKey?: boolean;

  @IsOptional() @IsString()
  chatModel?: string;

  @IsOptional() @IsString()
  embedModel?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(2)
  temperature?: number;

  @IsOptional() @IsInt() @Min(16) @Max(32000)
  maxTokens?: number;

  @IsOptional() @IsInt() @Min(1000) @Max(600000)
  timeoutMs?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  indexedAppIds?: string[];

  @IsOptional() @IsInt() @Min(100) @Max(4000)
  chunkSize?: number;

  @IsOptional() @IsInt() @Min(0) @Max(1000)
  chunkOverlap?: number;

  // ===== リクエストキュー =====
  @IsOptional() @IsInt() @Min(1) @Max(8)
  maxConcurrency?: number;

  @IsOptional() @IsInt() @Min(1) @Max(500)
  maxQueue?: number;

  @IsOptional() @IsInt() @Min(1000) @Max(600000)
  queueTimeoutMs?: number;

  // ===== モデル自動ロード/解放 =====
  @IsOptional() @IsBoolean()
  autoLoadModel?: boolean;

  @IsOptional() @IsBoolean()
  unloadPrevious?: boolean;

  @IsOptional() @IsString()
  lmsPath?: string;
}

/** モデルの手動ロード要求（管理者）。 */
export class LoadModelDto {
  @IsIn(['chat', 'embed'])
  kind!: 'chat' | 'embed';

  @IsOptional() @IsString()
  model?: string;
}
