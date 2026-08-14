export interface AuthUser {
  id?: string;
  userId?: string;
  loginId: string;
  name?: string | null;
  role: string;
}

/** ユーザーの表示名。氏名があれば氏名、なければログインID。 */
export function userDisplay(
  u: { name?: string | null; loginId?: string } | null | undefined,
): string {
  if (!u) return '';
  return (u.name && u.name.trim()) || u.loginId || '';
}

export function getUser(): AuthUser | null {
  const s = localStorage.getItem('user');
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/** 旧版localStorage JWTを一度だけCookieセッションへ交換し、端末から削除する。 */
export async function migrateLegacySession(apiBase: string): Promise<void> {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const response = await fetch(`${apiBase}/auth/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) localStorage.removeItem('user');
  } catch {
    // 一時的な通信失敗でも危険な旧トークンは保持しない。次回は再ログインする。
    localStorage.removeItem('user');
  } finally {
    localStorage.removeItem('token');
  }
}

export const ROLE_LABELS: Record<string, string> = {
  SystemAdmin: 'システム管理者',
  GroupAdmin: '管理者',
  AppCreator: 'アプリ作成者',
  StandardUser: '一般ユーザー',
  Viewer: '閲覧ユーザー',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

/** ユーザー/グループ(ディレクトリ)管理ができるか。SystemAdmin は全件、GroupAdmin は管轄内。 */
export function canManageDirectory(user: AuthUser | null): boolean {
  return user?.role === 'SystemAdmin' || user?.role === 'GroupAdmin';
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'SystemAdmin';
}

export function canCreateApp(user: AuthUser | null): boolean {
  return user?.role === 'SystemAdmin' || user?.role === 'AppCreator' || user?.role === 'GroupAdmin';
}
