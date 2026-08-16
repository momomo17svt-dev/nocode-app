import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

describe('DocumentsService department visibility', () => {
  let prisma: any;
  let embedding: any;
  let permission: any;
  let service: DocumentsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      group: { findUnique: jest.fn(), count: jest.fn() },
      knowledgeDoc: { findMany: jest.fn(), create: jest.fn() },
    };
    embedding = { indexDocument: jest.fn().mockResolvedValue(undefined) };
    permission = { visibleAppIds: jest.fn().mockResolvedValue(['app-1']) };
    service = new DocumentsService(prisma, embedding, permission);
  });

  it('システム管理者は文書IDの制限を受けない', async () => {
    await expect(service.visibleIds('admin-1', 'SystemAdmin')).resolves.toBeNull();
    expect(prisma.knowledgeDoc.findMany).not.toHaveBeenCalled();
  });

  it('所属部署と、その祖先部署から配下公開された文書を可視条件に含める', async () => {
    prisma.user.findUnique.mockResolvedValue({ groupId: 'group-child' });
    prisma.group.findUnique.mockImplementation(({ where }: any) => Promise.resolve(
      where.id === 'group-child' ? { parentId: 'group-parent' } : { parentId: null },
    ));
    prisma.knowledgeDoc.findMany.mockResolvedValue([{ id: 'doc-1' }]);

    await expect(service.visibleIds('user-1', 'User')).resolves.toEqual(['doc-1']);
    expect(prisma.knowledgeDoc.findMany).toHaveBeenCalledWith({
      where: {
        OR: expect.arrayContaining([
          { visibilityMode: 'all' },
          { visibilityMode: 'groups', includeDescendants: false, audiences: { some: { groupId: 'group-child' } } },
          { visibilityMode: 'groups', includeDescendants: true, audiences: { some: { groupId: { in: ['group-child', 'group-parent'] } } } },
        ]),
      },
      select: { id: true },
    });
  });

  it('部署限定の文書は複数部署と配下公開設定を保存する', async () => {
    prisma.group.count.mockResolvedValue(2);
    prisma.knowledgeDoc.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'doc-1', ...data }));

    await service.create({
      title: '就業規則',
      content: '本文',
      docKind: 'plain',
      visibilityMode: 'groups',
      groupIds: ['group-1', 'group-2'],
      includeDescendants: false,
    }, 'admin-1');

    expect(prisma.knowledgeDoc.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appId: null,
        visibilityMode: 'groups',
        includeDescendants: false,
        audiences: { create: [{ groupId: 'group-1' }, { groupId: 'group-2' }] },
      }),
    });
  });

  it('部署限定なのに部署が未選択なら保存を拒否する', async () => {
    await expect(service.create({
      title: '就業規則',
      content: '本文',
      docKind: 'plain',
      visibilityMode: 'groups',
      groupIds: [],
    }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
