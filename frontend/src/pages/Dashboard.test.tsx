import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { DashboardDef } from '../lib/dashboard';
import { Dashboard } from './Dashboard';

const mocks = vi.hoisted(() => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { toast, confirm: vi.fn().mockResolvedValue(true) };
});

vi.mock('../components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => mocks.toast }));
vi.mock('../components/ui/ConfirmDialog', () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock('../lib/auth', () => ({ getUser: () => ({ role: 'SystemAdmin' }), canCreateApp: () => true }));

function dashboard(id: string, name: string): DashboardDef {
  return {
    id,
    name,
    isShared: false,
    access: { mode: 'private', shares: [] },
    ownerId: 'u1',
    isOwner: true,
    canManage: true,
    canEdit: true,
    widgets: [],
    sortOrder: Number(id.slice(1)),
    createdAt: `2026-08-14T0${Number(id.slice(1))}:00:00.000Z`,
    updatedAt: `2026-08-14T0${Number(id.slice(1))}:00:00.000Z`,
  };
}

describe('Dashboard selector', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('最大6件だけをショートカット表示し、同名を番号で区別して一覧から切り替える', async () => {
    const dashboards = [
      dashboard('d1', '営業'),
      dashboard('d2', '営業'),
      ...Array.from({ length: 6 }, (_, index) => dashboard(`d${index + 3}`, `D${index + 3}`)),
    ];
    vi.spyOn(api, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/dashboards') return dashboards as never;
      return [] as never;
    });

    render(<Dashboard />);

    const shortcuts = await screen.findByTestId('dashboard-shortcuts');
    expect(within(shortcuts).getAllByRole('button')).toHaveLength(6);
    expect(within(shortcuts).getByText('営業 1/2')).toBeTruthy();
    expect(within(shortcuts).getByText('営業 2/2')).toBeTruthy();
    expect(within(shortcuts).queryByText('D8')).toBeNull();
    expect(screen.getByText('8')).toBeTruthy();

    const menu = screen.getByTestId('dashboard-menu-list');
    fireEvent.click(within(menu).getByRole('button', { name: /^D8/ }));

    await waitFor(() => expect(within(shortcuts).getByText('D8')).toBeTruthy());
    expect(localStorage.getItem('dash:selected')).toBe('d8');
  });
});
