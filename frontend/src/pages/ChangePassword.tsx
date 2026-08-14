import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';

export function ChangePassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setErr(''); setMsg('');
    if (newPassword.length < 8) { setErr('新しいパスワードは8文字以上にしてください'); return; }
    if (newPassword !== confirm) { setErr('確認用パスワードが一致しません'); return; }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setMsg('パスワードを変更しました');
      setCurrent(''); setNew(''); setConfirm('');
      toast.success('パスワードを変更しました');
    } catch (e: any) {
      setErr(e.message || '変更に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => navigate('/')} aria-label="戻る" />
        <h1 className="text-xl font-bold tracking-tight">パスワード変更</h1>
      </div>

      <div className="card p-6 max-w-md space-y-4">
        <Field label="現在のパスワード">
          <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="新しいパスワード（8文字以上）">
          <input type="password" className="input" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </Field>
        <Field label="新しいパスワード（確認）">
          <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        {err && (
          <div className="rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{err}</div>
        )}
        {msg && (
          <div className="flex items-center gap-1.5 rounded-lg border border-success-soft bg-success-soft px-3 py-2 text-sm text-success">
            <CheckCircle2 className="size-4" />{msg}
          </div>
        )}
        <Button variant="primary" icon={<KeyRound className="size-4" />} onClick={submit} loading={saving}>変更する</Button>
      </div>
    </Layout>
  );
}
