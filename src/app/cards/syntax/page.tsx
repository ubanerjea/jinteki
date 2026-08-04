import Link from "next/link";

// Static syntax reference (PHASE_7_PLAN.md item 7). No DB query, no
// `searchParams` - nothing on this page depends on request state.
//
// It documents **only what is implemented**, and names what is not. The
// "Not supported" section is required, not optional: it stops anyone
// arriving from Scryfall or NetrunnerDB wondering whether they missed a
// feature that simply does not exist here.
//
// Every worked example and count below was checked against the real synced
// database (2054 cards) while writing this page, not copied from a plan doc:
//
//   f:anarch      -> 253    t:operation -> 218    s:virus -> 41
//   d:runner      -> 928    f:anarch + s:virus -> 27
//   title "virus" -> 3      text "virus" -> 78    both ("virus"/"trash") -> 2
//   title "efficency", fuzzy off -> 0; fuzzy on -> 3 (Bioroid Efficiency
//   Research, Efficiency Committee, Peak Efficiency)
//   f:haas_bioroid -> 249
//   f:haas bioroid -> 0 (parses as faction "haas", which doesn't exist, AND
//   the leftover word "bioroid" searched as text - confirmed in psql:
//   `factionCode = 'haas' AND (title/text ILIKE '%bioroid%')` is 0 rows)
//   f:anar -> 0 (no partial match)   f:ANARCH -> 0 (no case-folding)
//   /cards?faction=nbn&q=f:anarch -> 241 (= every NBN card; the URL's filter
//   wins and the token is consumed)
//   Advanced Card Name "f:anarch" -> 0 (`title ILIKE '%f:anarch%'` is 0 rows;
//   no card title contains those characters)
//
// Scope change since the page was first written: the prefixes are recognised
// in **simple search only**. Advanced search's Card Name and Card Text are
// now pure literal substring matches with no prefix parsing at all - that
// page has real pickers for faction/type/subtype/side, which made a second,
// code-memorising way to set the same four facets redundant and confusing.

export const metadata = {
  title: "Search syntax",
};

const PREFIXES: { prefix: string; field: string; example: string; note: string }[] = [
  { prefix: "f:", field: "Faction", example: "f:anarch", note: "253 cards" },
  { prefix: "t:", field: "Type", example: "t:operation", note: "218 cards" },
  { prefix: "s:", field: "Subtype", example: "s:virus", note: "41 cards" },
  { prefix: "d:", field: "Side", example: "d:runner", note: "928 cards" },
];

const NOT_SUPPORTED: { what: string; example: string }[] = [
  { what: "Negation", example: "-f:anarch" },
  { what: "OR between terms", example: "anarch | criminal" },
  { what: "Quoted phrases", example: '"sure gamble"' },
  { what: "Regular expressions", example: "/^Sure/" },
  {
    what: "Any other prefix, including NetrunnerDB's",
    example: "x:2, a:flavour, e:core",
  },
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
        it is the one that understands the <code>f:</code> <code>t:</code>{" "}
        <code>s:</code> <code>d:</code> prefixes below.{" "}
        <Link href="/cards/advanced" className="underline">
          Advanced search
        </Link>{" "}
        splits names and text into separate fields with pickers for the rest —
        its two text fields are plain literal matches and do not read prefixes
        at all.
      </p>

      <Section title="Title and text">
        <p className="text-sm">
          Both fields are plain, case-insensitive substring matches against one
          column. Advanced search&apos;s <strong>Card Name</strong> looks only
          at the title; <strong>Card Text</strong> looks only at the rules text.
        </p>
        <ul className="ml-5 list-disc text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            Card Name <code>virus</code> matches 3 cards; Card Text{" "}
            <code>virus</code> matches 78.
          </li>
          <li>
            Filling both means a card must match <strong>both</strong>: Card
            Name <code>virus</code> plus Card Text <code>trash</code> matches 2.
          </li>
          <li>
            Simple search&apos;s single box is the opposite — it matches title{" "}
            <strong>or</strong> text, so it is the wider net of the two.
          </li>
        </ul>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Known limit: there are no quoted phrases. Whatever you type is taken
          as one literal substring, spaces included.
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
          . A recognised prefix is removed from the text and applied as a
          filter instead.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          They do <strong>not</strong> apply to advanced search&apos;s Card
          Name and Card Text fields. Those are pure literal substring matches
          with no prefix parsing, so typing <code>f:anarch</code> into Card
          Name looks for cards whose title contains the characters
          &ldquo;f:anarch&rdquo; and finds none. Use that page&apos;s Faction,
          Type, Subtype and Side controls instead — they do the same job
          without needing the code.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-zinc-500">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1 pr-4 font-medium">Prefix</th>
                <th className="py-1 pr-4 font-medium">Filters</th>
                <th className="py-1 pr-4 font-medium">Example</th>
                <th className="py-1 font-medium">Matches</th>
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
                  <td className="py-1 text-zinc-500">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Combine them and everything is ANDed: <code>f:anarch s:virus</code>{" "}
          matches 27 cards. Anything left over after the prefixes are removed is
          searched as ordinary text.
        </p>
        <ul className="ml-5 list-disc text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <strong>The value is the underlying code, not the display name</strong>{" "}
            — lowercase, with an underscore where the name has a space or
            hyphen. Haas-Bioroid is <code>f:haas_bioroid</code> (249 cards);
            Corp Identity is <code>t:corp_identity</code>; Code Gate is{" "}
            <code>s:code_gate</code>.
          </li>
          <li>
            <strong>No spaces, and quoting doesn&apos;t help.</strong> Text is
            split into words before prefixes are recognised, so a prefix and
            its value have to be one word with no space in between.{" "}
            <code>f:haas bioroid</code> is read as two separate words —{" "}
            <code>f:haas</code> (an unrecognised faction code, so it matches
            nothing) and <code>bioroid</code> (searched as ordinary text) —
            and finds nothing, not Haas-Bioroid cards.{" "}
            <code>f:&quot;haas bioroid&quot;</code> is parsed exactly the same
            way; quote marks are just characters here, not syntax. Use the
            underscored code instead.
          </li>
          <li>
            <strong>Exact and case-sensitive.</strong> Unlike Card Name and
            Card Text, a prefix value has to be the whole code:{" "}
            <code>f:anar</code> matches nothing (no partial match), and{" "}
            <code>f:ANARCH</code> matches nothing (codes are always
            lowercase). Only the prefix letter itself ignores case —{" "}
            <code>F:anarch</code> and <code>f:anarch</code> are the same.
          </li>
          <li>
            <strong>You don&apos;t have to know the code.</strong> Simple
            search&apos;s box completes these values as you type: type{" "}
            <code>f:</code> and it lists every faction with its code; keep
            typing to narrow the list, then pick one with the arrow keys and
            Enter, with Tab, or by clicking. That is the whole reason the
            strictness above is liveable. With JavaScript off the box is still
            an ordinary text field and the syntax still works — you just have
            to type the code yourself.
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
            consumed either way: it was recognised as a prefix, not left behind
            as literal words to search for. Use <strong>Clear filter</strong>{" "}
            to drop the inbound filter.
          </li>
          <li>
            An unrecognised prefix is left alone and searched as literal text —{" "}
            <code>x:foo</code> looks for cards containing the characters
            &ldquo;x:foo&rdquo; (there are none).
          </li>
          <li>
            <strong>Repeating a prefix for the same field keeps only the
            first.</strong> <code>f:anarch f:criminal</code> filters to
            Anarch; the second token is still removed from the text, not
            searched as the literal words &ldquo;f:criminal&rdquo;. This is
            different from advanced search&apos;s Faction picker, where
            choosing several values is a real <em>either of these</em> — to
            search two factions at once, use the picker.
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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Only the four prefixes in the table above exist. There is deliberately
          no larger query grammar here.
        </p>
      </Section>
    </main>
  );
}
