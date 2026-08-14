import { AiService } from './ai.service';

describe('AiService source selection', () => {
  let service: AiService;
  let prisma: any;
  let permission: any;
  let llm: any;
  let documents: any;

  beforeEach(() => {
    prisma = {
      embedding: { findMany: jest.fn().mockResolvedValue([]) },
    };
    permission = {
      visibleAppIds: jest.fn().mockResolvedValue(['app-1']),
    };
    llm = {
      chat: jest.fn().mockResolvedValue('通常回答'),
      chatStream: jest.fn(),
      embed: jest.fn().mockResolvedValue([[1, 0]]),
    };
    const embedding = { cosine: jest.fn().mockReturnValue(0.8) };
    documents = { visibleIds: jest.fn().mockResolvedValue(['doc-1']) };
    service = new AiService(prisma, permission, llm, embedding as any, documents);
  });

  it('plain は検索を行わず通常チャットとして回答する', async () => {
    const search = jest.spyOn(service, 'search');

    const result = await service.ask('user-1', 'User', '文章を整えて', [], { sourceMode: 'plain' });

    expect(result).toEqual({ answer: '通常回答', sources: [] });
    expect(search).not.toHaveBeenCalled();
    expect(llm.embed).not.toHaveBeenCalled();
    expect(llm.chat).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('社内のアプリデータやナレッジを参照していません') }),
      { role: 'user', content: '文章を整えて' },
    ]));
  });

  it('records は指定された閲覧可能アプリのレコードだけを検索する', async () => {
    await service.search('user-1', 'User', '未対応案件', { sourceMode: 'records', appId: 'app-1' });

    expect(prisma.embedding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { source: 'record', appId: 'app-1' },
    }));
  });

  it('閲覧できないアプリを指定しても検索候補に含めない', async () => {
    await service.search('user-1', 'User', '秘密案件', { sourceMode: 'records', appId: 'app-2' });

    expect(prisma.embedding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { source: 'record', appId: '__none__' },
    }));
  });

  it('knowledge はレコードを混ぜず、可視ナレッジだけを検索する', async () => {
    await service.search('user-1', 'User', '就業規則', { sourceMode: 'knowledge' });

    expect(prisma.embedding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        source: 'document',
        docId: { in: ['doc-1'] },
      },
    }));
  });

  it('閲覧できないナレッジを指定しても検索候補に含めない', async () => {
    await service.search('user-1', 'User', '機密規程', { sourceMode: 'knowledge', docId: 'doc-2' });

    expect(prisma.embedding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { source: 'document', docId: '__none__' },
    }));
  });

  it('関連度が低い場合はLLMへ推測させず、参照範囲の見直しを案内する', async () => {
    jest.spyOn(service, 'search').mockResolvedValue({
      hits: [{ source: 'document', appId: null, title: '無関係な資料', snippet: '...', score: 0.2 }],
    });

    const result = await service.ask('user-1', 'User', '該当情報は？', [], { sourceMode: 'knowledge' });

    expect(result.answer).toContain('参照範囲に関連情報が見つかりませんでした');
    expect(result.sources).toEqual([]);
    expect(llm.chat).not.toHaveBeenCalled();
  });
});
