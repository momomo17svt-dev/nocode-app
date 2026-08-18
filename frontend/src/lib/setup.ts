import { publicApi } from './publicApi';

export type SetupStatus = { required: boolean; passwordMinLength: number };

const DEFAULT_MIN_LENGTH = 8;
let cached: SetupStatus = { required: false, passwordMinLength: DEFAULT_MIN_LENGTH };

/**
 * 管理者がまだ1人もいない状態か。起動時に一度だけ問い合わせ、以後は同期的に参照する
 * （ルーティングの判定で await できないため）。
 */
export function isSetupRequired(): boolean {
  return cached.required;
}

export function setupStatus(): SetupStatus {
  return { ...cached };
}

export function setSetupRequired(required: boolean): void {
  cached = { ...cached, required };
}

/** 応答が得られない場合はセットアップ不要として扱い、通常のログイン画面へ倒す。 */
export async function loadSetupStatus(): Promise<SetupStatus> {
  try {
    const status = (await publicApi.get('/setup/status')) as Partial<SetupStatus> | null;
    cached = {
      required: Boolean(status?.required),
      passwordMinLength: Number(status?.passwordMinLength) || DEFAULT_MIN_LENGTH,
    };
  } catch {
    cached = { required: false, passwordMinLength: DEFAULT_MIN_LENGTH };
  }
  return { ...cached };
}
