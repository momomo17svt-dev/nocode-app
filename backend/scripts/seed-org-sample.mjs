// 会社の組織構造サンプルを投入する（部署ツリー + サンプル社員）。
// 稼働中の API(:3001) に対して実行する。日本語名を正しく送るため Node の fetch(UTF-8) を使う。
//   実行: node scripts/seed-org-sample.mjs
// 冪等性: ルート部署が既にある場合は中止。サンプル社員は既存ならスキップして所属だけ付与。

const BASE = process.env.API_BASE || 'http://localhost:3001/api';
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PW;
const SAMPLE_PW = process.env.SAMPLE_PW;

if (!ADMIN_PW || !SAMPLE_PW || SAMPLE_PW.length < 12) {
  throw new Error('Set ADMIN_PW and a unique SAMPLE_PW of 12 or more characters before running this script.');
}

let token = '';
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// 部署ツリー（会社 > 本部 > 部 > 課）
const TREE = {
  name: 'サンプル商事株式会社',
  children: [
    {
      name: '営業本部',
      children: [
        { name: '第一営業部', children: [{ name: '営業1課' }, { name: '営業2課' }] },
        { name: '第二営業部', children: [{ name: '営業3課' }] },
      ],
    },
    {
      name: '開発本部',
      children: [
        { name: '製品開発部', children: [{ name: '第一開発課' }, { name: '第二開発課' }] },
        { name: '品質保証部' },
      ],
    },
    {
      name: '管理本部',
      children: [{ name: '総務部' }, { name: '人事部' }, { name: '経理部' }],
    },
  ],
};

// サンプル社員（loginId は識別しやすい romaji、dept は所属部署名）
const USERS = [
  { loginId: 'shacho', dept: 'サンプル商事株式会社' },
  { loginId: 'eigyo_honbucho', dept: '営業本部' },
  { loginId: 'eigyo1_yamada', dept: '営業1課' },
  { loginId: 'eigyo1_sato', dept: '営業1課' },
  { loginId: 'eigyo2_suzuki', dept: '営業2課' },
  { loginId: 'eigyo3_tanaka', dept: '営業3課' },
  { loginId: 'kaihatsu_honbucho', dept: '開発本部' },
  { loginId: 'dev1_ito', dept: '第一開発課' },
  { loginId: 'dev1_watanabe', dept: '第一開発課' },
  { loginId: 'dev2_kato', dept: '第二開発課' },
  { loginId: 'qa_kobayashi', dept: '品質保証部' },
  { loginId: 'soumu_yoshida', dept: '総務部' },
  { loginId: 'jinji_yamamoto', dept: '人事部' },
  { loginId: 'keiri_nakamura', dept: '経理部' },
];

const nameToId = new Map();

async function createTree(node, parentId) {
  const group = await api('POST', '/groups', { name: node.name, parentId: parentId ?? '' });
  nameToId.set(node.name, group.id);
  for (const c of node.children ?? []) await createTree(c, group.id);
}

async function main() {
  token = (await api('POST', '/auth/login', { loginId: ADMIN_ID, password: ADMIN_PW })).access_token;

  // 冪等性: ルートが既にあれば中止
  const existingGroups = await api('GET', '/groups');
  if (existingGroups.some((g) => g.name === TREE.name)) {
    console.log(`ルート部署「${TREE.name}」が既に存在します。重複投入を避けるため中止しました。`);
    return;
  }

  console.log('部署ツリーを作成中...');
  await createTree(TREE, '');
  console.log(`  ${nameToId.size} 部署を作成`);

  // ユーザー（既存ならスキップ）
  const existingUsers = await api('GET', '/users');
  const userIdByLogin = new Map(existingUsers.map((u) => [u.loginId, u.id]));

  console.log('サンプル社員を作成 / 所属付与中...');
  let created = 0;
  let assigned = 0;
  for (const u of USERS) {
    let id = userIdByLogin.get(u.loginId);
    if (!id) {
      const user = await api('POST', '/users', { loginId: u.loginId, password: SAMPLE_PW, role: 'StandardUser' });
      id = user.id;
      created++;
    }
    const gid = nameToId.get(u.dept);
    if (gid) {
      try {
        await api('POST', `/groups/${gid}/members`, { userId: id });
        assigned++;
      } catch (e) {
        if (!String(e.message).includes('既にメンバー')) throw e;
      }
    }
  }
  console.log(`  社員 ${created} 名作成、所属 ${assigned} 件付与`);
  console.log(`\n完了。サンプル社員の初期パスワードは「${SAMPLE_PW}」です。`);
}

main().catch((e) => {
  console.error('失敗:', e.message);
  process.exit(1);
});
