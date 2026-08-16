import 'reflect-metadata'; // DTOのデコレータを経由して読み込むため
import { sanitizeDefinition } from './app-definition.util';

describe('sanitizeDefinition', () => {
  it('fieldCode が __proto__ でもプロトタイプを汚さない', () => {
    // slugCode は英数字と _ を残すため __proto__ は素通りする。
    // 索引を素のオブジェクトで持つと、この代入でプロトタイプが差し替わっていた。
    const def = sanitizeDefinition({
      name: 'テスト',
      fields: [
        { fieldCode: '__proto__', fieldType: 'text', label: '汚染' },
        { fieldCode: 'title', fieldType: 'text', label: '件名' },
      ],
    });
    expect(({} as any).polluted).toBeUndefined();
    expect(def.fields.map((f) => f.fieldCode)).toEqual(['__proto__', 'title']);
  });

  it('__proto__ を statusField に指定してもプロセスとして採用しない', () => {
    const def = sanitizeDefinition({
      fields: [{ fieldCode: 'state', fieldType: 'status', label: '状態', settings: { options: ['未', '済'] } }],
      processConfig: { statusField: '__proto__', statuses: ['未', '済'] },
    });
    expect(def.processConfig).toBeUndefined();
  });

  it('AIアクションの targetField は実在する項目のときだけ付く', () => {
    const def = sanitizeDefinition({
      fields: [{ fieldCode: 'memo', fieldType: 'textarea', label: 'メモ' }],
      aiConfig: {
        actions: [
          { name: '要約', prompt: 'まとめて', output: 'field', targetField: 'memo' },
          { name: '別件', prompt: 'なにか', output: 'field', targetField: 'constructor' },
        ],
      },
    });
    expect(def.aiConfig?.actions[0]).toMatchObject({ output: 'field', targetField: 'memo' });
    expect(def.aiConfig?.actions[1]).toMatchObject({ output: 'show' });
    expect(def.aiConfig?.actions[1].targetField).toBeUndefined();
  });
});
