import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'src');
const i18nFile = path.join(sourceRoot, 'lib', 'i18n.tsx');
const japanese = /[ぁ-んァ-ヶ一-龠]/;

function sourceFile(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function translationKeys() {
  const source = sourceFile(i18nFile);
  const keys = new Set();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'EN' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isNoSubstitutionTemplateLiteral(property.name))) {
          keys.add(property.name.text.trim());
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return keys;
}

function filesUnder(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && full !== i18nFile) result.push(full);
  }
  return result;
}

const keys = translationKeys();
const found = new Map();

function add(value, file, source, node, kind) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || !japanese.test(normalized) || keys.has(normalized)) return;
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  const item = found.get(normalized) ?? { text: normalized, locations: [] };
  if (item.locations.length < 5) item.locations.push({
    file: path.relative(root, file).replaceAll('\\', '/'),
    line: position.line + 1,
    kind,
  });
  found.set(normalized, item);
}

for (const file of filesUnder(sourceRoot)) {
  const source = sourceFile(file);
  function visit(node) {
    if (ts.isJsxText(node)) add(node.getText(source), file, source, node, 'jsx');
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text, file, source, node, 'string');
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node.text, file, source, node, 'template');
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const items = [...found.values()].sort((a, b) => a.text.localeCompare(b.text, 'ja'));
const byKind = items.reduce((acc, item) => {
  const kind = item.locations[0]?.kind ?? 'unknown';
  acc[kind] = (acc[kind] ?? 0) + 1;
  return acc;
}, {});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ translated: keys.size, missing: items.length, byKind, items }, null, 2));
} else {
  console.log(`Translation keys: ${keys.size}`);
  console.log(`Untranslated Japanese candidates: ${items.length}`);
  console.log(`Kinds: ${JSON.stringify(byKind)}`);
  for (const item of items) {
    const where = item.locations.map((location) => `${location.file}:${location.line}`).join(', ');
    console.log(`${item.text}\t${where}`);
  }
}

if (process.argv.includes('--strict') && items.length > 0) process.exitCode = 1;
