import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { APP_NAME } from '../config/branding';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function Login() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ user: Record<string, unknown> }>('/auth/login', { loginId, password });
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-canvas relative overflow-hidden">
      <LanguageSwitcher className="absolute right-4 top-4 z-10" />
      {/* 背景の装飾 */}
      <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 size-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="card w-full max-w-sm p-8 animate-pop-in relative">
        <div className="flex flex-col items-center text-center mb-7">
          <span className="grid place-items-center size-12 rounded-xl bg-primary text-primary-fg mb-3 shadow-[0_8px_24px_-8px_var(--primary)]">
            <Zap className="size-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-sm text-muted mt-1">業務アプリ基盤にサインイン</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Field label="ログインID">
            <input
              type="text"
              aria-label="ログインID"
              className="input"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label="パスワード">
            <input
              type="password"
              aria-label="パスワード"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && (
            <div className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" loading={loading} icon={<LogIn className="size-4" />} className="w-full">
            {loading ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>

        <p className="text-xs text-muted text-center mt-6 leading-relaxed">
          初期管理者はセットアップ時に安全なパスワードで作成されます。
        </p>
      </div>
    </div>
  );
}
