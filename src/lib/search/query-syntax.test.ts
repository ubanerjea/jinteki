import { describe, expect, it } from "vitest";

import {
  isMatchNone,
  parseQuery,
  type QueryAst,
} from "./query-syntax";

function prefix(op: string, value: string): QueryAst {
  return { type: "prefix", op: op as never, value };
}

function text(column: "title" | "text" | "both", value: string): QueryAst {
  return { type: "text", column, value };
}

describe("parseQuery", () => {
  it("recognizes the original four prefixes and their long forms", () => {
    expect(parseQuery("f:anarch")).toEqual(prefix("faction", "anarch"));
    expect(parseQuery("t:ice")).toEqual(prefix("type", "ice"));
    expect(parseQuery("s:virus")).toEqual(prefix("keyword", "virus"));
    expect(parseQuery("d:runner")).toEqual(prefix("side", "runner"));
    expect(parseQuery("faction:anarch")).toEqual(prefix("faction", "anarch"));
    expect(parseQuery("type:ice")).toEqual(prefix("type", "ice"));
    expect(parseQuery("subtype:virus")).toEqual(prefix("keyword", "virus"));
    expect(parseQuery("keyword:virus")).toEqual(prefix("keyword", "virus"));
    expect(parseQuery("side:runner")).toEqual(prefix("side", "runner"));
  });

  it("is case-insensitive on the prefix, not the value", () => {
    expect(parseQuery("F:anarch")).toEqual(prefix("faction", "anarch"));
    expect(parseQuery("Faction:anarch")).toEqual(prefix("faction", "anarch"));
    expect(parseQuery("f:ANARCH")).toEqual(prefix("faction", "ANARCH"));
  });

  it("treats f:anarch virus as faction plus residual virus", () => {
    expect(parseQuery("f:anarch virus")).toEqual({
      type: "and",
      left: prefix("faction", "anarch"),
      right: text("both", "virus"),
    });
  });

  it("accepts a space after the colon", () => {
    expect(parseQuery("f: anarch")).toEqual(parseQuery("f:anarch"));
    expect(parseQuery("f:  anarch")).toEqual(parseQuery("f:anarch"));
  });

  it("does not parse title: as t:", () => {
    expect(parseQuery("title:sure")).toEqual(text("title", "sure"));
    expect(parseQuery("title:sure")).not.toEqual(prefix("type", "itle:sure"));
    expect(parseQuery("title:sure")).not.toEqual(prefix("type", "sure"));
  });

  it("parses format, banned, set, and cycle prefixes", () => {
    expect(parseQuery("format:standard")).toEqual(prefix("format", "standard"));
    expect(parseQuery("fmt:standard")).toEqual(prefix("format", "standard"));
    expect(parseQuery("banned:yes")).toEqual(prefix("banned", "yes"));
    expect(parseQuery("ban:no")).toEqual(prefix("banned", "no"));
    expect(parseQuery("b:yes")).toEqual(prefix("banned", "yes"));
    expect(parseQuery("set:kala_ghoda")).toEqual(prefix("set", "kala_ghoda"));
    expect(parseQuery("e:kala_ghoda")).toEqual(prefix("set", "kala_ghoda"));
    expect(parseQuery("e:kala ghoda")).toEqual(prefix("set", "kala ghoda"));
    expect(parseQuery("cy:mumbad")).toEqual(prefix("cycle", "mumbad"));
    expect(parseQuery("cycle:mumbad")).toEqual(prefix("cycle", "mumbad"));
    expect(parseQuery("cy:10")).toEqual(prefix("cycle", "10"));
    expect(parseQuery("c:mumbad")).toEqual(prefix("cycle", "mumbad"));
  });

  it("parses boolean grouping, OR, AND, and negation", () => {
    expect(parseQuery("f:anarch & (t:program | t:resource)")).toEqual({
      type: "and",
      left: prefix("faction", "anarch"),
      right: {
        type: "or",
        left: prefix("type", "program"),
        right: prefix("type", "resource"),
      },
    });
    expect(parseQuery("!f:anarch")).toEqual({
      type: "not",
      child: prefix("faction", "anarch"),
    });
    expect(parseQuery("f:anarch AND !t:program")).toEqual({
      type: "and",
      left: prefix("faction", "anarch"),
      right: { type: "not", child: prefix("type", "program") },
    });
  });

  it("treats unmatched parens as match-none", () => {
    expect(isMatchNone(parseQuery("("))).toBe(true);
    expect(isMatchNone(parseQuery("f:anarch ("))).toBe(true);
    expect(isMatchNone(parseQuery("f:anarch)"))).toBe(true);
  });

  it("treats a dangling infix operator as match-none", () => {
    expect(isMatchNone(parseQuery("f:anarch |"))).toBe(true);
    expect(isMatchNone(parseQuery("f:anarch &"))).toBe(true);
    expect(isMatchNone(parseQuery("| f:anarch"))).toBe(true);
  });

  it("does not treat flush | as OR", () => {
    expect(parseQuery("t:program|t:resource")).toEqual(
      prefix("type", "program|t:resource"),
    );
  });

  it("treats x: as a text operator, not residual x:foo", () => {
    expect(parseQuery("x:foo")).toEqual(text("text", "foo"));
    expect(parseQuery("x:foo bar")).toEqual(text("text", "foo bar"));
    expect(parseQuery("i:sure gamble")).toEqual(text("title", "sure gamble"));
  });

  it("keeps consecutive residual words as one phrase", () => {
    expect(parseQuery("sure gamble")).toEqual(text("both", "sure gamble"));
    expect(parseQuery("sure | gamble")).toEqual({
      type: "or",
      left: text("both", "sure"),
      right: text("both", "gamble"),
    });
    expect(parseQuery("sure AND gamble")).toEqual({
      type: "and",
      left: text("both", "sure"),
      right: text("both", "gamble"),
    });
  });

  it("treats a query that is only the word and/or as residual text", () => {
    expect(parseQuery("and")).toEqual(text("both", "and"));
    expect(parseQuery("OR")).toEqual(text("both", "OR"));
    expect(parseQuery("  and  ")).toEqual(text("both", "and"));
  });

  it("ANDs two factions rather than first-wins", () => {
    expect(parseQuery("f:anarch f:criminal")).toEqual({
      type: "and",
      left: prefix("faction", "anarch"),
      right: prefix("faction", "criminal"),
    });
  });

  it("leaves an unrecognized prefix as residual text", () => {
    expect(parseQuery("z:foo")).toEqual(text("both", "z:foo"));
  });

  it("stops a phrase-valued prefix at the next prefix", () => {
    expect(parseQuery("e:kala ghoda t:program")).toEqual({
      type: "and",
      left: prefix("set", "kala ghoda"),
      right: prefix("type", "program"),
    });
  });
});
