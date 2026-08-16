import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from './ChatPanel';

const mocks = vi.hoisted(() => ({ askStream: vi.fn() }));

vi.mock('../../lib/ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/ai')>();
  return { ...original, askStream: mocks.askStream };
});

describe('ChatPanel source selection', () => {
  beforeEach(() => {
    mocks.askStream.mockReset();
    mocks.askStream.mockImplementation(async (_body, handlers) => {
      handlers.onSources?.([]);
      handlers.onToken?.('回答');
      handlers.onDone?.();
    });
  });

  it('既定では参照なしで、埋め込みモデルが未接続でも通常チャットを使える', () => {
    render(<ChatPanel allowSourceSelection disabled={false} ragDisabled />);

    expect((screen.getByLabelText('参照範囲') as HTMLSelectElement).value).toBe('plain');
    expect(screen.getByText('現在はアプリデータやナレッジを参照しません。')).toBeTruthy();
    expect(screen.getByPlaceholderText(/質問を入力/)).not.toBeDisabled();
  });

  it('アプリデータを選ぶと、選択したアプリIDと参照モードを送信する', async () => {
    render(<ChatPanel allowSourceSelection apps={[{ id: 'app-1', name: '案件管理' }]} />);

    fireEvent.change(screen.getByLabelText('参照範囲'), { target: { value: 'records' } });
    fireEvent.change(screen.getByLabelText('対象アプリ'), { target: { value: 'app-1' } });
    fireEvent.change(screen.getByPlaceholderText(/質問を入力/), { target: { value: '未対応案件は？' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(mocks.askStream).toHaveBeenCalledWith(
      expect.objectContaining({ question: '未対応案件は？', sourceMode: 'records', appId: 'app-1', docId: undefined }),
      expect.any(Object),
    ));
  });

  it('ナレッジ画面から引き継いだ文書を初期選択して質問する', async () => {
    render(
      <ChatPanel
        allowSourceSelection
        sourceMode="knowledge"
        docId="doc-1"
        knowledge={[{ id: 'doc-1', title: '経費精算規程', appId: null, chunks: 3, length: 1200, updatedAt: '2026-08-14T00:00:00.000Z' }]}
      />,
    );

    expect((screen.getByLabelText('参照範囲') as HTMLSelectElement).value).toBe('knowledge');
    expect((screen.getByLabelText('対象ナレッジ') as HTMLSelectElement).value).toBe('doc-1');

    fireEvent.change(screen.getByPlaceholderText(/質問を入力/), { target: { value: '申請期限は？' } });
    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(mocks.askStream).toHaveBeenCalledWith(
      expect.objectContaining({ question: '申請期限は？', sourceMode: 'knowledge', docId: 'doc-1' }),
      expect.any(Object),
    ));
  });
});
