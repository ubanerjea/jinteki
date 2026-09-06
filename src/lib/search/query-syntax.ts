// Simple-search query language: registry, tokenizer, recursive-descent
// parser, AST. No DB access (so the client type-ahead can import the
// prefix list). Compilation to SQL lives in cards.ts.
//
// Grammar (AND binds tighter than OR):
//   query   := or
//   or      := and ( OR and )*          # OR / |
//   and     := not ( AND? not )*        # AND / & / implicit space
//   not     := "!" not | primary
//   primary := "(" query ")" | term
//   term    := prefix-term | text-phrase
//
// `&` / `|` must have spaces on both sides. Unmatched parens or a dangling
// infix operator produce a match-none AST rather than searching the
// punctuation as text.

export type PrefixOp =
  | "faction"
  | "type"
  | "keyword"
  | "side"
  | "format"
  | "banned"
  | "set"
  | "cycle";

export type TextColumn = "title" | "text" | "both";

export type CompletableField =
  | "faction"
  | "type"
  | "keyword"
  | "side"
  | "format"
  | "banned"
  | "pack"
  | "cycle";

export type QueryAst =
  | { type: "and"; left: QueryAst; right: QueryAst }
  | { type: "or"; left: QueryAst; right: QueryAst }
  | { type: "not"; child: QueryAst }
  | { type: "prefix"; op: PrefixOp; value: string }
  | { type: "text"; column: TextColumn; value: string }
  | { type: "match_all" }
  | { type: "match_none" };

type ValueKind = "code" | "phrase";

interface OperatorDef {
  id: PrefixOp | "title" | "text";
  prefixes: string[];
  kind: ValueKind;
}

const OPERATOR_DEFS: OperatorDef[] = [
  { id: "faction", prefixes: ["faction", "f"], kind: "code" },
  { id: "type", prefixes: ["type", "t"], kind: "code" },
  { id: "keyword", prefixes: ["subtype", "keyword", "s"], kind: "code" },
  { id: "side", prefixes: ["side", "d"], kind: "code" },
  { id: "format", prefixes: ["format", "fmt"], kind: "code" },
  { id: "banned", prefixes: ["banned", "ban", "b"], kind: "code" },
  { id: "set", prefixes: ["pack", "set", "e"], kind: "phrase" },
  { id: "cycle", prefixes: ["cycle", "cy", "c"], kind: "phrase" },
  { id: "title", prefixes: ["title", "i"], kind: "phrase" },
  { id: "text", prefixes: ["text", "x"], kind: "phrase" },
];

interface PrefixMatch {
  prefix: string;
  id: OperatorDef["id"];
  kind: ValueKind;
}

const PREFIX_MATCHERS: PrefixMatch[] = OPERATOR_DEFS.flatMap((def) =>
  def.prefixes.map((prefix) => ({ prefix, id: def.id, kind: def.kind })),
).sort((a, b) => b.prefix.length - a.prefix.length);

const COMPLETABLE_PREFIX_LIST: { prefix: string; field: CompletableField }[] = [
  { prefix: "faction", field: "faction" },
  { prefix: "keyword", field: "keyword" },
  { prefix: "subtype", field: "keyword" },
  { prefix: "banned", field: "banned" },
  { prefix: "format", field: "format" },
  { prefix: "cycle", field: "cycle" },
  { prefix: "pack", field: "pack" },
  { prefix: "type", field: "type" },
  { prefix: "side", field: "side" },
  { prefix: "fmt", field: "format" },
  { prefix: "ban", field: "banned" },
  { prefix: "set", field: "pack" },
  { prefix: "cy", field: "cycle" },
  { prefix: "f", field: "faction" },
  { prefix: "t", field: "type" },
  { prefix: "s", field: "keyword" },
  { prefix: "d", field: "side" },
  { prefix: "b", field: "banned" },
  { prefix: "e", field: "pack" },
  { prefix: "c", field: "cycle" },
];

export const COMPLETABLE_PREFIXES = COMPLETABLE_PREFIX_LIST.sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

export function matchCompletablePrefix(
  body: string,
): { prefix: string; field: CompletableField } | null {
  const lower = body.toLowerCase();
  for (const spec of COMPLETABLE_PREFIXES) {
    if (lower.startsWith(`${spec.prefix}:`)) return spec;
  }
  return null;
}

type Token =
  | { kind: "and" }
  | { kind: "or" }
  | { kind: "not" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "prefix"; op: PrefixOp; value: string }
  | { kind: "text"; column: TextColumn; value: string };

function matchPrefixAt(s: string, i: number): PrefixMatch | null {
  const rest = s.slice(i).toLowerCase();
  for (const spec of PREFIX_MATCHERS) {
    if (rest.startsWith(`${spec.prefix}:`)) return spec;
  }
  return null;
}

function isAmpOrPipeOp(s: string, i: number): boolean {
  const ch = s[i];
  if (ch !== "&" && ch !== "|") return false;
  const leftOk = i === 0 || /\s/.test(s[i - 1]);
  const rightOk = i + 1 >= s.length || /\s/.test(s[i + 1]);
  return leftOk && rightOk;
}

function peekWord(s: string, i: number): string {
  let j = i;
  while (j < s.length && !/\s/.test(s[j]) && s[j] !== "(" && s[j] !== ")") j += 1;
  return s.slice(i, j);
}

function booleanWordAt(s: string, i: number): "and" | "or" | null {
  const word = peekWord(s, i);
  const lower = word.toLowerCase();
  if (lower === "and" || lower === "or") return lower;
  return null;
}

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  return i;
}

function isTerminatorAt(s: string, i: number): boolean {
  if (i >= s.length) return true;
  const ch = s[i];
  if (ch === "(" || ch === ")") return true;
  if (ch === "!") return true;
  if (isAmpOrPipeOp(s, i)) return true;
  if (booleanWordAt(s, i)) return true;
  if (matchPrefixAt(s, i)) return true;
  return false;
}

function consumePhrase(s: string, from: number): { value: string; end: number } {
  let i = from;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "(" || ch === ")") break;
    if (/\s/.test(ch)) {
      const j = skipWs(s, i);
      if (isTerminatorAt(s, j)) break;
    } else if (i > from && matchPrefixAt(s, i) && (/\s/.test(s[i - 1]) || s[i - 1] === "(")) {
      break;
    }
    i += 1;
  }
  return { value: s.slice(from, i).trim(), end: i };
}

function consumeCodeValue(s: string, from: number): { value: string; end: number } {
  let i = from;
  while (i < s.length && !/\s/.test(s[i]) && s[i] !== "(" && s[i] !== ")") i += 1;
  return { value: s.slice(from, i), end: i };
}

export function tokenize(input: string): Token[] {
  const s = input;
  const tokens: Token[] = [];
  let i = 0;

  while (i < s.length) {
    i = skipWs(s, i);
    if (i >= s.length) break;

    const ch = s[i];
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (ch === "!") {
      tokens.push({ kind: "not" });
      i += 1;
      continue;
    }
    if (isAmpOrPipeOp(s, i)) {
      tokens.push({ kind: ch === "&" ? "and" : "or" });
      i += 1;
      continue;
    }
    const bool = booleanWordAt(s, i);
    if (bool) {
      tokens.push({ kind: bool });
      i += peekWord(s, i).length;
      continue;
    }
    const prefix = matchPrefixAt(s, i);
    if (prefix) {
      i += prefix.prefix.length + 1;
      i = skipWs(s, i);
      const consumed =
        prefix.kind === "code" ? consumeCodeValue(s, i) : consumePhrase(s, i);
      i = consumed.end;
      if (prefix.id === "title") {
        tokens.push({ kind: "text", column: "title", value: consumed.value });
      } else if (prefix.id === "text") {
        tokens.push({ kind: "text", column: "text", value: consumed.value });
      } else {
        tokens.push({
          kind: "prefix",
          op: prefix.id,
          value: consumed.value,
        });
      }
      continue;
    }

    const phrase = consumePhrase(s, i);
    if (!phrase.value) {
      // Punctuation we don't recognize: skip one char rather than spinning.
      i += 1;
      continue;
    }
    tokens.push({ kind: "text", column: "both", value: phrase.value });
    i = phrase.end;
  }

  // `q=and` / `q=or` is residual text, not a missing-operand error.
  if (tokens.length === 1 && (tokens[0].kind === "and" || tokens[0].kind === "or")) {
    return [{ kind: "text", column: "both", value: input.trim() }];
  }
  return tokens;
}

class TokenParser {
  i = 0;
  error = false;

  constructor(private readonly tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.i];
  }

  consume(): Token | undefined {
    const t = this.tokens[this.i];
    if (t) this.i += 1;
    return t;
  }

  parseQuery(): QueryAst {
    if (this.tokens.length === 0) return { type: "match_all" };
    const ast = this.parseOr();
    if (this.i < this.tokens.length) this.error = true;
    if (this.error) return { type: "match_none" };
    return ast;
  }

  private parseOr(): QueryAst {
    let left = this.parseAnd();
    while (!this.error && this.peek()?.kind === "or") {
      this.consume();
      if (this.atTermEnd()) {
        this.error = true;
        break;
      }
      const right = this.parseAnd();
      left = { type: "or", left, right };
    }
    return left;
  }

  private parseAnd(): QueryAst {
    let left = this.parseNot();
    while (!this.error) {
      const next = this.peek();
      if (!next || next.kind === "or" || next.kind === "rparen") break;
      if (next.kind === "and") {
        this.consume();
        if (this.atTermEnd()) {
          this.error = true;
          break;
        }
      } else if (
        next.kind !== "prefix" &&
        next.kind !== "text" &&
        next.kind !== "not" &&
        next.kind !== "lparen"
      ) {
        this.error = true;
        break;
      }
      const right = this.parseNot();
      left = { type: "and", left, right };
    }
    return left;
  }

  private parseNot(): QueryAst {
    if (this.peek()?.kind === "not") {
      this.consume();
      if (this.atTermEnd()) {
        this.error = true;
        return { type: "match_none" };
      }
      return { type: "not", child: this.parseNot() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): QueryAst {
    const next = this.peek();
    if (next?.kind === "lparen") {
      this.consume();
      if (this.atTermEnd() || this.peek()?.kind === "rparen") {
        this.error = true;
        return { type: "match_none" };
      }
      const inner = this.parseOr();
      if (this.peek()?.kind === "rparen") {
        this.consume();
      } else {
        this.error = true;
      }
      return inner;
    }
    if (next?.kind === "prefix") {
      this.consume();
      return { type: "prefix", op: next.op, value: next.value };
    }
    if (next?.kind === "text") {
      this.consume();
      return { type: "text", column: next.column, value: next.value };
    }
    this.error = true;
    return { type: "match_none" };
  }

  private atTermEnd(): boolean {
    const next = this.peek();
    return (
      !next ||
      next.kind === "or" ||
      next.kind === "and" ||
      next.kind === "rparen"
    );
  }
}

export function parseQuery(input: string): QueryAst {
  return new TokenParser(tokenize(input)).parseQuery();
}

export function isMatchNone(ast: QueryAst): boolean {
  return ast.type === "match_none";
}

const BANNED_YES = new Set(["yes", "y", "1", "true"]);
const BANNED_NO = new Set(["no", "n", "0", "false"]);

export function parseBannedValue(value: string): boolean | null {
  const lower = value.toLowerCase();
  if (BANNED_YES.has(lower)) return true;
  if (BANNED_NO.has(lower)) return false;
  return null;
}

export function collectFormatValues(ast: QueryAst, out: string[] = []): string[] {
  switch (ast.type) {
    case "and":
    case "or":
      collectFormatValues(ast.left, out);
      collectFormatValues(ast.right, out);
      break;
    case "not":
      collectFormatValues(ast.child, out);
      break;
    case "prefix":
      if (ast.op === "format") out.push(ast.value);
      break;
    default:
      break;
  }
  return out;
}

export function collectTextTerms(
  ast: QueryAst,
  out: { column: TextColumn; value: string }[] = [],
): { column: TextColumn; value: string }[] {
  switch (ast.type) {
    case "and":
    case "or":
      collectTextTerms(ast.left, out);
      collectTextTerms(ast.right, out);
      break;
    case "not":
      collectTextTerms(ast.child, out);
      break;
    case "text":
      if (ast.value) out.push({ column: ast.column, value: ast.value });
      break;
    default:
      break;
  }
  return out;
}
