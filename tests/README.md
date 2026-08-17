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

## Coverage

| File | Covers | Guards against |
| --- | --- | --- |
| `faq-detection.test.mjs` | `koshFaqProbe()` and `isSchemaOrgRdfa()` from `skills/aeo/references/faq-detection.md` | False `critical` FAQ findings: RDFa/microdata asymmetry, empty `mainEntity` scoring `valid`, case-sensitive `faq` selectors, wrapped answer text, CTA `?` headings manufacturing a phantom FAQ, and failing a site that legitimately has no FAQ |

Add a fixture for every FAQ-scoring bug fixed — each row in the table above started as a
review finding on a real report run.
