# Tests

Fixture checks for logic the skills instruct the agent to run in the browser.

These are deliberately thin: they extract the JavaScript **out of the skill documentation**
and run it against synthetic DOM fixtures, so the code under test is by construction the
same code the agent is told to inject. A snippet that drifts from its documented form
fails here.

## Running

```bash
npm install jsdom        # only dependency
node tests/faq-detection.test.mjs
```

These are a **deliberate manual check**, not CI — no `package.json`, no workflow. Run them
when you touch a documented browser snippet. Treating them as load-bearing would mean wiring
CI, which is a separate decision.

## Coverage

| File | Covers | Guards against |
| --- | --- | --- |
| `faq-detection.test.mjs` | `koshFaqProbe()` from `skills/aeo/references/faq-detection.md` | False `critical` FAQ findings: RDFa/microdata asymmetry, empty `mainEntity` scoring `valid`, case-sensitive `faq` selectors, wrapped answer text, CTA `?` headings in separate page-builder bands manufacturing a phantom FAQ, failing a site that legitimately has no FAQ — plus a self-containment guard that the probe runs with nothing else injected |

## Conventions these checks enforce

1. **The runner injects exactly what the doc instructs — nothing more.** The FAQ runner
   requires the reference doc to contain exactly one JavaScript block and evaluates only
   that. A helper split into a second block fails here rather than passing because the test
   concatenated sources; that is precisely how a `ReferenceError` once reached the PR.
2. **Widening a heuristic requires a negative fixture.** Any change that makes a check match
   more markup ships with a case for the pattern it could newly match by mistake.

Add a fixture for every FAQ-scoring bug fixed — each row in the table above started as a
review finding on a real report run.
