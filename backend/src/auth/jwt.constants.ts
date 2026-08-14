/**
 * JWT 署名鍵を環境変数から取得する（auth.module と jwt.strategy で同一値を共有）。
 * 未設定・空・既定プレースホルダのままなら起動時に例外で停止する（フェイルファスト）。
 * かつてのハードコード fallback ('super_secret_key_123') は撤去済み:
 * 鍵が漏れた状態で起動すると任意ユーザーのトークンを偽造できてしまうため。
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error(
      'JWT_SECRET が未設定です。backend/.env に固有のランダム値を設定してください（例: openssl rand -hex 32）。',
    );
  }
  if (secret.startsWith('change_me')) {
    throw new Error(
      'JWT_SECRET が初期プレースホルダ（change_me...）のままです。固有のランダム値へ変更してください。',
    );
  }
  return secret;
}
