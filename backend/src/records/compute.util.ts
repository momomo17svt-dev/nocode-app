/**
 * 計算フィールド用の安全な数式評価器。
 * 対応:
 *   - 数値・フィールドコード参照・( )
 *   - 四則演算 + - * / ・単項マイナス
 *   - 比較演算 > < >= <= == != （真=1 / 偽=0 を返す）
 *   - 関数 if(条件, 真の値, 偽の値) / min / max / abs / round / floor / ceil
 * eval は使わず再帰下降でパースする。
 */
export function evalFormula(formula: string, values: Record<string, any>): number | string {
  try {
    const tokens = tokenize(formula);
    const p = new Parser(tokens, values);
    const result = p.parseExpression();
    if (!p.atEnd()) throw new Error('数式の構文エラー');
    return Number.isFinite(result) ? Math.round(result * 1e6) / 1e6 : '';
  } catch {
    return '';
  }
}

type Tok = { t: 'num' | 'id' | 'op' | 'paren' | 'comma'; v: string };
const CMP = ['>', '<', '>=', '<=', '==', '!='];

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let n = '';
      while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
      toks.push({ t: 'num', v: n });
    } else if (/[A-Za-z_]/.test(c)) {
      let id = '';
      while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) id += s[i++];
      toks.push({ t: 'id', v: id });
    } else if ('+-*/'.includes(c)) {
      toks.push({ t: 'op', v: c });
      i++;
    } else if (c === '(' || c === ')') {
      toks.push({ t: 'paren', v: c });
      i++;
    } else if (c === ',') {
      toks.push({ t: 'comma', v: ',' });
      i++;
    } else if (c === '<' || c === '>') {
      if (s[i + 1] === '=') { toks.push({ t: 'op', v: c + '=' }); i += 2; }
      else { toks.push({ t: 'op', v: c }); i++; }
    } else if (c === '=' && s[i + 1] === '=') {
      toks.push({ t: 'op', v: '==' }); i += 2;
    } else if (c === '!' && s[i + 1] === '=') {
      toks.push({ t: 'op', v: '!=' }); i += 2;
    } else {
      throw new Error('不正な文字: ' + c);
    }
  }
  return toks;
}

class Parser {
  pos = 0;
  constructor(private toks: Tok[], private vals: Record<string, any>) {}

  atEnd() { return this.pos >= this.toks.length; }
  private peek() { return this.toks[this.pos]; }
  private next() { return this.toks[this.pos++]; }

  // 比較（最も低い優先度）。a <op> b は 1/0 を返す。
  parseExpression(): number {
    const left = this.parseAdditive();
    if (!this.atEnd() && this.peek().t === 'op' && CMP.includes(this.peek().v)) {
      const op = this.next().v;
      const right = this.parseAdditive();
      return compare(left, op, right) ? 1 : 0;
    }
    return left;
  }

  private parseAdditive(): number {
    let left = this.parseTerm();
    while (!this.atEnd() && this.peek().t === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
      const op = this.next().v;
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    while (!this.atEnd() && this.peek().t === 'op' && (this.peek().v === '*' || this.peek().v === '/')) {
      const op = this.next().v;
      const right = this.parseFactor();
      left = op === '*' ? left * right : right === 0 ? 0 : left / right;
    }
    return left;
  }

  private parseFactor(): number {
    const tok = this.peek();
    if (!tok) throw new Error('式が途中で終了');
    if (tok.t === 'op' && tok.v === '-') { this.next(); return -this.parseFactor(); }
    if (tok.t === 'op' && tok.v === '+') { this.next(); return this.parseFactor(); }
    if (tok.t === 'num') { this.next(); return parseFloat(tok.v); }
    if (tok.t === 'id') {
      this.next();
      if (!this.atEnd() && this.peek().t === 'paren' && this.peek().v === '(') {
        return this.parseCall(tok.v);
      }
      return Number(this.vals[tok.v] ?? 0) || 0;
    }
    if (tok.t === 'paren' && tok.v === '(') {
      this.next();
      const v = this.parseExpression();
      if (this.atEnd() || this.next().v !== ')') throw new Error('括弧が閉じていない');
      return v;
    }
    throw new Error('予期しないトークン: ' + tok.v);
  }

  private parseCall(name: string): number {
    this.next(); // consume '('
    const args: number[] = [];
    if (!(this.peek()?.t === 'paren' && this.peek()?.v === ')')) {
      args.push(this.parseExpression());
      while (!this.atEnd() && this.peek().t === 'comma') {
        this.next();
        args.push(this.parseExpression());
      }
    }
    if (this.atEnd() || this.next().v !== ')') throw new Error('関数の括弧が閉じていない');
    return applyFunc(name, args);
  }
}

function compare(l: number, op: string, r: number): boolean {
  switch (op) {
    case '>': return l > r;
    case '<': return l < r;
    case '>=': return l >= r;
    case '<=': return l <= r;
    case '==': return l === r;
    case '!=': return l !== r;
    default: return false;
  }
}

function applyFunc(name: string, args: number[]): number {
  switch (name) {
    case 'if': return args[0] !== 0 ? (args[1] ?? 0) : (args[2] ?? 0);
    case 'min': return Math.min(...args);
    case 'max': return Math.max(...args);
    case 'abs': return Math.abs(args[0] ?? 0);
    case 'round': return Math.round(args[0] ?? 0);
    case 'floor': return Math.floor(args[0] ?? 0);
    case 'ceil': return Math.ceil(args[0] ?? 0);
    default: throw new Error('未対応の関数: ' + name);
  }
}

/**
 * ルール表（条件分岐）による値の決定。コードを書かずに「条件→値」をUIで組むためのモデル。
 * settings = { mode:'rules', rules:[{ when:[{field,op,value,value2}], result }], fallback }
 * 上から順に評価し、when（AND結合）を最初に満たしたルールの result を返す。該当なしは fallback。
 */
export interface RuleCond { field: string; op: string; value?: any; value2?: any; }
export interface Rule { when: RuleCond[]; result: any; }

export function evalRules(settings: any, values: Record<string, any>): number | string {
  const rules: Rule[] = settings?.rules || [];
  for (const rule of rules) {
    const conds = rule?.when || [];
    if (conds.every((c) => matchRuleCond(values[c.field], c.op, c.value, c.value2))) {
      return coerceResult(rule.result);
    }
  }
  return coerceResult(settings?.fallback ?? '');
}

// 数値比較では未入力/非数値は 0 として扱う（計算式エンジンと同じ挙動）。
const numOf = (v: any): number => { const n = Number(v); return isNaN(n) ? 0 : n; };

function matchRuleCond(v: any, op: string, value: any, value2: any): boolean {
  switch (op) {
    case '>': return numOf(v) > numOf(value);
    case '<': return numOf(v) < numOf(value);
    case '>=': return numOf(v) >= numOf(value);
    case '<=': return numOf(v) <= numOf(value);
    case '==': return String(v ?? '') === String(value ?? '');
    case '!=': return String(v ?? '') !== String(value ?? '');
    case 'between': return numOf(v) >= numOf(value) && numOf(v) <= numOf(value2);
    case 'empty': return v === null || v === undefined || v === '';
    case 'notempty': return !(v === null || v === undefined || v === '');
    default: return false;
  }
}

function coerceResult(r: any): number | string {
  if (typeof r === 'number') return r;
  if (typeof r === 'string' && r.trim() !== '' && !isNaN(Number(r))) return Number(r);
  return r ?? '';
}

/** 自動採番の表示文字列を生成。例: prefix="INQ-", padding=4, n=12 -> "INQ-0012" */
export function formatAutoNumber(n: number, settings: any): string {
  const prefix = settings?.prefix ?? '';
  const padding = Number(settings?.padding ?? 0);
  const num = padding > 0 ? String(n).padStart(padding, '0') : String(n);
  return `${prefix}${num}`;
}
