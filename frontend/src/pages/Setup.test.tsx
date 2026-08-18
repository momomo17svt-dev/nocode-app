import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicApi } from '../lib/publicApi';
import { isSetupRequired, setSetupRequired } from '../lib/setup';
import { Setup } from './Setup';

describe('Setup', () => {
  beforeEach(() => {
    localStorage.clear();
    setSetupRequired(true);
    vi.restoreAllMocks();
    vi.spyOn(publicApi, 'get').mockResolvedValue({ required: true, passwordMinLength: 8 });
  });

  it('管理者を作成するとサインイン済みになり、以後はセットアップ不要になる', async () => {
    const post = vi
      .spyOn(publicApi, 'post')
      .mockResolvedValue({ user: { id: 'u1', loginId: 'admin', role: 'SystemAdmin' } });
    render(<MemoryRouter><Setup /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('表示名'), { target: { value: '管理者' } });
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'strong-password' } });
    fireEvent.change(screen.getByLabelText('パスワード（確認）'), { target: { value: 'strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: '管理者を作成して開始' }));

    await waitFor(() => expect(localStorage.getItem('user')).toContain('admin'));
    expect(post).toHaveBeenCalledWith('/setup/admin', {
      loginId: 'admin',
      name: '管理者',
      password: 'strong-password',
    });
    expect(isSetupRequired()).toBe(false);
  });

  it('確認用パスワードが違う場合は送信しない', async () => {
    const post = vi.spyOn(publicApi, 'post');
    render(<MemoryRouter><Setup /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'strong-password' } });
    fireEvent.change(screen.getByLabelText('パスワード（確認）'), { target: { value: 'typo-password' } });
    fireEvent.click(screen.getByRole('button', { name: '管理者を作成して開始' }));

    await screen.findByText('パスワードが一致しません');
    expect(post).not.toHaveBeenCalled();
  });

  it('パスワードが最小長より短い場合は送信しない', async () => {
    const post = vi.spyOn(publicApi, 'post');
    render(<MemoryRouter><Setup /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('パスワード（確認）'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: '管理者を作成して開始' }));

    await screen.findByText('パスワードは8文字以上にしてください');
    expect(post).not.toHaveBeenCalled();
  });
});
