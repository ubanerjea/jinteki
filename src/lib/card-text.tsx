import { Fragment, type ReactNode } from "react";

// NRDB's card `text` field embeds a small, fixed vocabulary of formatting
// tags (confirmed by scanning all synced card text: only these four appear).
// Deliberately NOT using dangerouslySetInnerHTML - this only ever recognizes
// these exact tag names and builds real React elements from them; anything
// else (including any other tag-like substring) is left as literal text,
// which React escapes normally. Unknown/unbalanced input degrades to plain
// text rather than ever being interpreted as markup.
const ALLOWED_TAGS = ["strong", "em", "ul", "li"] as const;
type AllowedTag = (typeof ALLOWED_TAGS)[number];

function isAllowedTag(tag: string): tag is AllowedTag {
  return (ALLOWED_TAGS as readonly string[]).includes(tag);
}

interface TextNode {
  tag: AllowedTag | null;
  children: (string | TextNode)[];
}

const TAG_TOKEN = /<(\/?)(\w+)>/g;

function parse(text: string): TextNode {
  const root: TextNode = { tag: null, children: [] };
  const stack: TextNode[] = [root];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TAG_TOKEN.lastIndex = 0;
  while ((match = TAG_TOKEN.exec(text))) {
    const [full, closingSlash, tagName] = match;
    const before = text.slice(lastIndex, match.index);
    if (before) stack[stack.length - 1].children.push(before);
    lastIndex = match.index + full.length;

    if (!isAllowedTag(tagName)) {
      // Unrecognized tag-like token: keep it as literal text, not markup.
      stack[stack.length - 1].children.push(full);
      continue;
    }

    if (!closingSlash) {
      const node: TextNode = { tag: tagName, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (stack.length > 1 && stack[stack.length - 1].tag === tagName) {
      stack.pop();
    } else {
      // Unbalanced/unexpected closing tag: keep as literal text.
      stack[stack.length - 1].children.push(full);
    }
  }

  const rest = text.slice(lastIndex);
  if (rest) stack[stack.length - 1].children.push(rest);

  return root;
}

function toReact(node: TextNode, key: string): ReactNode {
  const children = node.children.map((child, i) =>
    typeof child === "string" ? child : toReact(child, `${key}-${i}`),
  );

  if (node.tag === null) return <Fragment key={key}>{children}</Fragment>;

  switch (node.tag) {
    case "strong":
      return <strong key={key}>{children}</strong>;
    case "em":
      return <em key={key}>{children}</em>;
    case "ul":
      return <ul key={key}>{children}</ul>;
    case "li":
      return <li key={key}>{children}</li>;
  }
}

/** Renders NRDB card text, interpreting its small set of known formatting tags. */
export function renderCardText(text: string): ReactNode {
  return toReact(parse(text), "root");
}
