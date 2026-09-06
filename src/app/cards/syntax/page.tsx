import Link from "next/link";

// Static syntax reference. No DB query, no `searchParams` - nothing on this
// page depends on request state.
//
// It documents **only what is implemented**, and names what is not. Every
// worked count below was re-derived against the live synced database while
// writing this page (2054 cards, 2026-09-06), not copied from a plan doc.

export const metadata = {
  title: "Search syntax",
};

const PREFIXES: {
  prefix: string;
  field: string;
  example: string;
  note: string;
  typeahead: string;
}[] = [
  {
    prefix: "f: / faction:",
    field: "Faction",
    example: "f:anarch",
    note: "253 cards",
    typeahead: "yes",
  },
  {
    prefix: "t: / type:",
    field: "Type",
    example: "t:operation",
    note: "218 cards",
    typeahead: "yes",
  },
  {
    prefix: "s: / subtype: / keyword:",
    field: "Subtype",
    example: "s:virus",
    note: "41 cards",
    typeahead: "yes",
  },
  {
    prefix: "d: / side:",
    field: "Side",
    example: "d:runner",
    note: "928 cards",
    typeahead: "yes",
  },
  {
    prefix: "fmt: / format:",
    field: "Format (current pool)",
    example: "format:standard",
    note: "613 cards",
    typeahead: "yes",
  },
  {
    prefix: "b: / ban: / banned:",
    field: "Banned in that format",
    example: "format:standard banned:yes",
    note: "29 cards",
    typeahead: "yes (yes / no)",
  },
  {
    prefix: "e: / set: / pack:",
    field: "Set (any printing)",
    example: "e:kala_ghoda",
    note: "19 cards",
    typeahead: "yes",
  },
  {
    prefix: "c: / cy: / cycle:",
    field: "Cycle",
    example: "cy:mumbad",
    note: "114 cards",
    typeahead: "yes",
  },
  {
    prefix: "i: / title:",
    field: "Title only",
    example: "i:virus",
    note: "3 cards",
    typeahead: "no",
  },
  {
    prefix: "x: / text:",
    field: "Text only",
    example: "x:virus",
    note: "78 cards",
    typeahead: "no",
  },
];

const NOT_SUPPORTED: { what: string; example: string }[] = [
  { what: "Quoted phrases", example: '"sure gamble"' },
  { what: "Regular expressions", example: "/^Sure/" },
  { what: "Numeric operands", example: "o:3, p>1" },
  { what: "Flavor text", example: "a:flavour" },
  { what: "Illustrator", example: "NRDB's i: (see title: above)" },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function SearchSyntaxPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Search syntax</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/cards" className="underline">
            Simple search
          </Link>
          <Link href="/cards/advanced" className="underline">
            Advanced search
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        There are two search pages.{" "}
        <Link href="/cards" className="underline">
          Simple search
        </Link>{" "}
        has a single box that matches card names and rules text together, and
        it is the one that understands the prefixes and boolean logic below.{" "}
        <Link href="/cards/advanced" className="underline">
          Advanced search
        </Link>{" "}
        splits names and text into separate fields with pickers for the rest —
        its two text fields are plain literal matches and do not read prefixes
        at all. The same format / banned / set filters also exist as query
        params on{" "}
        <Link href="/cards/advanced/results" className="underline">
          advanced results
        </Link>
        .
      </p>

      <Section title="Title and text">
        <p className="text-sm">
          Simple search&apos;s box matches title <strong>or</strong> text by
          default. Restrict to one column with <code>i:</code> /{" "}
          <code>title:</code> (title only) or <code>x:</code> /{" "}
          <code>text:</code> (rules text only). Advanced search&apos;s{" "}
          <strong>Card Name</strong> and <strong>Card Text</strong> fields are
          the same split, as plain literal substrings with no prefix parsing.
        </p>
        <ul className="ml-5 list-disc text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <code>i:virus</code> matches 3 cards; <code>x:virus</code> matches
            78. Residual <code>virus</code> is the wider net (title or text).
          </li>
          <li>
            Filling both advanced fields means a card must match{" "}
            <strong>both</strong>: Card Name <code>virus</code> plus Card Text{" "}
            <code>trash</code> matches 2.
          </li>
          <li>
            <code>i:</code> is <strong>title</strong>, not NetrunnerDB&apos;s
            illustrator operand. jinteki has no illustrator data.
          </li>
        </ul>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Known limit: there are no quoted phrases. Consecutive residual words
          are one substring, spaces included — <code>sure gamble</code> is
          still one phrase. Use <code>sure AND gamble</code> or{" "}
          <code>sure | gamble</code> to split them.
        </p>
      </Section>

      <Section title="Fuzzy matching (opt-in)">
        <p className="text-sm">
          Advanced search matches literally by default. The{" "}
          <strong>Matching</strong> checkbox adds trigram similarity on top, so
          near-misses and typos are found too.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Worked example: Card Name <code>efficency</code> (misspelt) finds{" "}
          <strong>nothing</strong> on its own. Tick the box and it finds 3 cards
          — <em>Bioroid Efficiency Research</em>, <em>Efficiency Committee</em>{" "}
          and <em>Peak Efficiency</em>.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          With fuzzy on, loosely-related cards can appear; they rank below solid
          matches rather than being excluded. Simple search always matches this
          forgiving way, which is why it can return{" "}
          <strong>more</strong> results than advanced search for the same word.
          That difference is deliberate: casual search is forgiving, precise
          search is literal.
        </p>
      </Section>

      <Section title="Prefixes">
        <p className="text-sm">
          These work in <strong>simple search only</strong> — the box on the{" "}
          <Link href="/" className="underline">
            home page
          </Link>
          , the one on{" "}
          <Link href="/cards" className="underline">
            /cards
          </Link>
          , and the Simple search field at the top of{" "}
          <Link href="/cards/advanced" className="underline">
            advanced search
          </Link>
          . Each operator has a short form and a long form (and some aliases).
          Prefix letters are case-insensitive; values are not, except format /
          set / cycle names.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          They do <strong>not</strong> apply to advanced search&apos;s Card
          Name and Card Text fields. Those are pure literal substring matches
          with no prefix parsing, so typing <code>f:anarch</code> into Card
          Name looks for cards whose title contains the characters
          &ldquo;f:anarch&rdquo; and finds none. Use that page&apos;s pickers
          instead.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1 pr-4 font-medium">Prefix</th>
                <th className="py-1 pr-4 font-medium">Filters</th>
                <th className="py-1 pr-4 font-medium">Example</th>
                <th className="py-1 pr-4 font-medium">Matches</th>
                <th className="py-1 font-medium">Type-ahead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {PREFIXES.map((p) => (
                <tr key={p.prefix}>
                  <td className="py-1 pr-4">
                    <code>{p.prefix}</code>
                  </td>
                  <td className="py-1 pr-4">{p.field}</td>
                  <td className="py-1 pr-4">
                    <code>{p.example}</code>
                  </td>
                  <td className="py-1 pr-4 text-zinc-500">{p.note}</td>
                  <td className="py-1 text-zinc-500">{p.typeahead}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Space-separated terms are ANDed: <code>f:anarch s:virus</code>{" "}
          matches 27 cards; <code>f:anarch t:program</code> matches 76.{" "}
          <code>f:anarch virus</code> is Anarch AND residual &ldquo;virus&rdquo;
          (title or text).
        </p>
        <ul className="ml-5 list-disc text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <strong>Code-valued prefixes</strong> (<code>f</code> <code>t</code>{" "}
            <code>s</code> <code>d</code> <code>fmt</code> <code>ban</code>)
            take one word after the colon. Optional space after the colon is
            fine: <code>f: anarch</code> is the same as <code>f:anarch</code>.
            Haas-Bioroid is <code>f:haas_bioroid</code> (249 cards); Corp
            Identity is <code>t:corp_identity</code>. Values are exact and
            case-sensitive: <code>f:anar</code> and <code>f:ANARCH</code>{" "}
            match nothing.
          </li>
          <li>
            <strong>Phrase-valued prefixes</strong> (<code>i</code>{" "}
            <code>x</code> <code>e</code> <code>cy</code>) take everything
            until a boolean, a parenthesis, another prefix, or the end.{" "}
            <code>e:kala ghoda</code> and <code>e:kala_ghoda</code> both hit
            Kala Ghoda (19 cards).
          </li>
          <li>
            <strong>You don&apos;t have to know the code</strong> for
            type-ahead prefixes: type <code>f:</code> (or{" "}
            <code>faction:</code>, <code>format:</code>, <code>e:</code>,{" "}
            <code>cy:</code>, <code>ban:</code>, …) and pick from the list.
            Completions insert the code, never the display name. With
            JavaScript off the box is still an ordinary text field.
          </li>
        </ul>
      </Section>

      <Section title="Boolean logic">
        <ul className="ml-5 list-disc text-sm">
          <li>
            Space (and explicit <code>AND</code> / <code>&amp;</code>) is AND
            and binds tighter than OR.
          </li>
          <li>
            <code>OR</code> / <code>|</code> is OR. Two factions is{" "}
            <code>f:anarch | f:criminal</code>, not two space-separated
            prefixes.
          </li>
          <li>
            <code>!</code> negates the next term or group:{" "}
            <code>!f:anarch</code>, <code>f:anarch AND !t:program</code>,{" "}
            <code>!(t:program | t:resource)</code>.
          </li>
          <li>
            Parentheses group. Unmatched parens or a dangling{" "}
            <code>&amp;</code> / <code>|</code> match nothing.
          </li>
          <li>
            <code>&amp;</code> and <code>|</code>{" "}
            <strong>need spaces on both sides</strong>.{" "}
            <code>t:program|t:resource</code> is a type code that will not
            match, not an OR.
          </li>
        </ul>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <strong>
            Repeating a prefix for the same field is AND, not first-wins.
          </strong>{" "}
          <code>f:anarch f:criminal</code> used to keep only Anarch; it now
          matches cards that are both (none). Use{" "}
          <code>f:anarch | f:criminal</code> for either.
        </p>
      </Section>

      <Section title="Set and cycle">
        <p className="text-sm">
          Set and cycle resolve against the catalog, then filter cards whose{" "}
          <code>card_set_ids</code> contain any of those pack codes (any
          printing, same as <code>?pack=</code>). No <code>cycle=</code> URL
          param — cycle is a box prefix only.
        </p>
        <ul className="ml-5 list-disc text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            Set matches pack code, pack name (case-insensitive), or integer{" "}
            <strong>in-cycle position</strong> — <code>e:1</code> ORs every
            pack whose position is 1, not a global catalog number. Type-ahead
            inserts the code.
          </li>
          <li>
            Cycle matches cycle id, name, or position: <code>cy:mumbad</code>{" "}
            and <code>cy:10</code> are both Mumbad (114 cards, six packs).
          </li>
          <li>An unknown value matches nothing.</li>
        </ul>
      </Section>

      <Section title="Format and banned">
        <p className="text-sm">
          <code>format:standard</code> is current-pool membership, the same
          613 cards as <code>?format=standard</code>. The value is a format
          id or name, case-insensitive (<code>format:Standard</code> works).
        </p>
        <p className="text-sm">
          <code>banned:yes</code> / <code>ban:no</code> (also{" "}
          <code>y</code>/<code>n</code>/<code>1</code>/<code>0</code>/
          <code>true</code>/<code>false</code>) needs a format from a format
          term in the same query, else URL <code>format=</code>. Without a
          format, <code>banned:yes</code> matches nothing and{" "}
          <code>banned:no</code> is a no-op. Restricted and points cards stay
          in on <code>banned:no</code>; they are still legal.
        </p>
        <ul className="ml-5 list-disc text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <code>format:standard banned:yes</code> — 29 currently banned.
          </li>
          <li>
            <code>format:standard banned:no</code> — 584 currently legal
            (pool minus banned).
          </li>
          <li>
            URL form on either simple or advanced results:{" "}
            <code>format=standard&amp;banned=1</code> / <code>banned=0</code>.
          </li>
        </ul>
      </Section>

      <Section title="Precedence">
        <ul className="ml-5 list-disc text-sm">
          <li>
            <strong>
              A filter already set in the URL beats a prefix for the same
              field.
            </strong>{" "}
            Follow a faction link into simple search — say{" "}
            <code>/cards?faction=nbn</code>, which shows a &ldquo;filtered
            by&rdquo; note — then type <code>f:anarch</code> in the box, and
            you still get the 241 NBN cards. The <code>f:</code> token is
            consumed either way. Use <strong>Clear filter</strong> to drop
            the inbound filter. Tokens inside <code>q</code> do not appear in
            that banner.
          </li>
          <li>
            An unrecognised prefix is left alone and searched as literal text —{" "}
            <code>z:foo</code> looks for cards containing those characters.
          </li>
        </ul>
      </Section>

      <Section title="Not supported">
        <p className="text-sm">
          None of the following do anything special. They are searched as
          ordinary characters, so they will usually find nothing.
        </p>
        <ul className="ml-5 list-disc text-sm">
          {NOT_SUPPORTED.map((n) => (
            <li key={n.what}>
              {n.what} — <code>{n.example}</code>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
