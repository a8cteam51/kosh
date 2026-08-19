# Tests

Fixture checks for logic the skills instruct the agent to run in the browser.

These are deliberately thin: they extract the JavaScript **out of the skill documentation**
and run it against synthetic DOM fixtures, so the code under test is by construction the
same code the agent is told to inject. A snippet that drifts from its documented form
fails here.

## Running

```bash
npm install jsdom                    # only dependency
node tests/faq-detection.test.mjs    # FAQ probe behavior
node tests/skill-snippets.test.mjs   # every snippet resolves its identifiers
```

These are a **deliberate manual check**, not CI — no `package.json`, no workflow. Run them
when you touch a documented browser snippet. Treating them as load-bearing would mean wiring
CI, which is a separate decision.

## Coverage

| File | Covers | Guards against |
| --- | --- | --- |
| `skill-snippets.test.mjs` | every `javascript` fenced block in `skills/aeo/SKILL.md` | A snippet referencing a helper or probe defined in another block. Each snippet runs as its own `browser_evaluate`, so definitions do not persist — such a snippet throws `ReferenceError` at runtime and silently kills the signal it feeds |
| `faq-detection.test.mjs` | `koshFaqProbe()` from `skills/aeo/references/faq-detection.md` | False `critical` FAQ findings: RDFa/microdata asymmetry, empty `mainEntity` scoring `valid`, case-sensitive `faq` selectors, wrapped answer text, CTA `?` headings in separate page-builder bands manufacturing a phantom FAQ, failing a site that legitimately has no FAQ — plus a self-containment guard that the probe runs with nothing else injected |

## Conventions these checks enforce

1. **The runner injects exactly what the doc instructs — nothing more.** The FAQ runner
   requires the reference doc to contain exactly one JavaScript block and evaluates only
   that. A helper split into a second block fails here rather than passing because the test
   concatenated sources; that is precisely how a `ReferenceError` once reached the PR.
2. **Every snippet resolves every identifier it uses.** A snippet is self-contained, or it
   names its dependency in `EXTERNAL_INJECTABLES` *and* carries an explicit
   "Inject `<name>` verbatim alongside this snippet" instruction in its own comments.
   Implicit reliance on another block is a failure.
3. **Test the class of defect, not the instance.** The same missing-identifier bug shipped
   twice — first `isSchemaOrgRdfa`, then `koshFaqProbe` — because the check grepped for the
   one name already known to be broken. `skill-snippets.test.mjs` carries a negative
   self-test so it must prove it can fail before it reports success.
4. **Widening a heuristic requires a negative fixture.** Any change that makes a check match
   more markup ships with a case for the pattern it could newly match by mistake.

Add a fixture for every FAQ-scoring bug fixed — each row in the table above started as a
review finding on a real report run.
