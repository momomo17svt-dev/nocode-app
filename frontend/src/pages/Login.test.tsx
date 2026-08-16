import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { Login } from './Login';

describe('Login', () => {
  it('ログイン後はトークンではなくユーザー情報だけを保存する', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ user: { id: 'u1', loginId: 'admin', role: 'SystemAdmin' } });
    render(<MemoryRouter><Login /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('ログインID'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => expect(localStorage.getItem('user')).toContain('admin'));
    expect(localStorage.getItem('token')).toBeNull();
  });
});
