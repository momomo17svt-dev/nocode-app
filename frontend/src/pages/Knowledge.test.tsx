import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiApi } from '../lib/ai';
import { Knowledge } from './Knowledge';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock('../components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => mocks.toast }));
vi.mock('../components/ui/ConfirmDialog', () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock('../lib/auth', () => ({ getUser: () => ({ role: 'User' }), isAdmin: () => false }));

describe('Knowledge', () => {
  beforeEach(() => {
    vi.spyOn(aiApi, 'listKnowledge').mockResolvedValue([{
      id: 'doc-1',
      title: '経費精算規程',
      appId: null,
      visibilityMode: 'groups',
      includeDescendants: true,
      groups: [{ id: 'group-1', name: '経理部' }],
      chunks: 3,
      length: 1200,
      updatedAt: '2026-08-14T00:00:00.000Z',
    }]);
  });

  it('文書管理に専念し、質問は対象文書付きでAIアシスタントへ送る', async () => {
    render(<MemoryRouter><Knowledge /></MemoryRouter>);

    await screen.findByText('経費精算規程');
    expect(screen.getByText(/経理部（配下含む）/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'チャット' })).toBeNull();
    expect(screen.queryByRole('button', { name: '検索' })).toBeNull();

    expect(screen.getByRole('link', { name: 'すべてのナレッジをAIに質問' })).toHaveAttribute(
      'href',
      '/ai?tab=chat&source=knowledge',
    );
    expect(screen.getByRole('link', { name: '経費精算規程をAIに質問' })).toHaveAttribute(
      'href',
      '/ai?tab=chat&source=knowledge&doc=doc-1',
    );
  });
});
