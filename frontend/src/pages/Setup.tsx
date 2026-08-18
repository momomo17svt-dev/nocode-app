import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, UserPlus } from 'lucide-react';
import { publicApi } from '../lib/publicApi';
import { setSetupRequired, setupStatus, loadSetupStatus } from '../lib/setup';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { APP_NAME } from '../config/branding';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

/**
 * 初回セットアップ画面。管理者が1人もいない間だけ表示され、
 * ここで作ったアカウントがそのままシステム管理者になる。
 */
export function Setup() {
  const [loginId, setLoginId] = useState('admin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [minLength, setMinLength] = useState(setupStatus().passwordMinLength);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void loadSetupStatus().then((status) => {
      setMinLength(status.passwordMinLength);
      if (!status.required) navigate('/login', { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < minLength) {
      setError(`パスワードは${minLength}文字以上にしてください`);
      return;
    }
    if (password !== confirm) {
      setError('パスワードが一致しません');
      return;
    }
    setLoading(true);
    try {
      const data = await publicApi.post('/setup/admin', { loginId, name, password });
      localStorage.setItem('user', JSON.stringify(data.user));
      setSetupRequired(false);
      navigate('/');
    } catch (err: any) {
      setError(err.message || '管理者の作成に失敗しました');
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
          <p className="text-sm text-muted mt-1">最初の管理者アカウントを作成します</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Field label="表示名">
            <input
              type="text"
              aria-label="表示名"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Administrator"
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
          <Field label="パスワード（確認）">
            <input
              type="password"
              aria-label="パスワード（確認）"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
          {error && (
            <div className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" loading={loading} icon={<UserPlus className="size-4" />} className="w-full">
            {loading ? '作成中...' : '管理者を作成して開始'}
          </Button>
        </form>

        <p className="text-xs text-muted text-center mt-6 leading-relaxed">
          この画面は管理者がいない間だけ表示されます。作成後はそのままサインインします。
        </p>
      </div>
    </div>
  );
}
