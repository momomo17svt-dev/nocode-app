import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider, getLocale, setLanguage, translate } from './i18n';

afterEach(() => setLanguage('ja'));

describe('English UI support', () => {
  it('stores the selected language and translates common UI text', () => {
    setLanguage('en');
    expect(localStorage.getItem('nocode:language')).toBe('en');
    expect(getLocale()).toBe('en-US');
    expect(translate('システム設定')).toBe('System Settings');
    expect(translate('12件')).toBe('12 items');
  });

  it('updates text and accessible attributes rendered by existing screens', async () => {
    render(
      <LanguageProvider>
        <section>
          <h1>ホーム</h1>
          <input aria-label="検索" placeholder="ユーザーを検索" />
        </section>
      </LanguageProvider>,
    );

    act(() => setLanguage('en'));

    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('Home'));
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Search users');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-label', 'Search');
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps Japanese as the compatibility default', () => {
    setLanguage('ja');
    expect(getLocale()).toBe('ja-JP');
    expect(translate('保存')).toBe('保存');
  });
});
