import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { AuditLogs } from './AuditLogs';

const mocks = vi.hoisted(() => {
  const toastError = vi.fn();
  return { toastError, toast: { error: toastError } };
});

vi.mock('../../components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => mocks.toast }));

describe('AuditLogs', () => {
  it('50件単位のページを取得して次ページへ移動する', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/directory/users') return [];
      const second = endpoint.includes('page=2');
      return {
        items: [{
          id: second ? 'log-2' : 'log-1', userId: null, actionType: 'LOGIN', targetResource: 'Auth',
          targetId: null, details: {}, ipAddress: null, createdAt: '2026-08-14T00:00:00.000Z',
        }],
        total: 51,
        page: second ? 2 : 1,
        pageSize: 50,
        totalPages: 2,
      } as never;
    });

    render(<AuditLogs />);

    await screen.findByText('全 51 件・2 ページ中 1 ページ目');
    expect(get).toHaveBeenCalledWith('/audit-logs?page=1&pageSize=50');

    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    await screen.findByText('全 51 件・2 ページ中 2 ページ目');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/audit-logs?page=2&pageSize=50'));
  });
});
