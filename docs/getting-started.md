# Getting Started with kosh

A step-by-step guide to installing and running your first test with kosh.

## What you'll need

Before you start, make sure you have the following installed:

1. **Claude Code:** Anthropic's CLI tool. If you don't have it yet, head to [claude.ai/code](https://claude.ai/code) and follow the install instructions for your platform. You'll need version 1.0.33 or later.

2. **Node.js:** Used for generating reports. Download it from [nodejs.org](https://nodejs.org) if you don't already have it. The LTS version is fine.

3. **Git:** Used to download the kosh code. Most Macs have it pre-installed. To check, open Terminal and type `git --version`. If you see a version number, you're good.

## Step 1: Clone the repository

Open your Terminal and run:

```bash
git clone https://github.com/a8cteam51/kosh.git
cd kosh
```

This downloads kosh to a folder called `kosh` in whatever directory your Terminal is currently in (usually your home folder), then moves into it.

### Alternative: Using the GitHub CLI

If you have the [GitHub CLI](https://cli.github.com/) installed, you can use it instead:

```bash
gh repo clone a8cteam51/kosh
cd kosh
```

If you don't have it yet, you can install it with `brew install gh` and then run `gh auth login` to sign in.

## Step 2: Start Claude Code with the plugin

From inside the `kosh` folder, run:

```bash
claude --plugin-dir .
```

This starts Claude Code with kosh loaded as a plugin.

### Trust the project settings

The first time you run this, Claude Code will ask you to trust the project's settings. **Type "yes" or press Enter to accept.** This pre-approves the browser tools that kosh needs (navigating to pages, taking screenshots, clicking links, etc.) so you won't have to approve each one individually during a test.

If you accidentally skip this step, you'll get a permission prompt for every browser action during testing. If that happens, exit (`/exit`) and start again.

## Step 3: Run a test

kosh has five test commands. Each one takes a URL — the site you want to test.

**Functional & design test:** Checks user journeys, layout, links, metadata, and content:
```
/kosh:functional-design https://example.com
```

**Performance test:** Checks load times, console errors, and network health:
```
/kosh:performance https://example.com
```

**Accessibility test:** Checks WCAG 2.2 Level AA compliance (headings, alt text, contrast, keyboard navigation):
```
/kosh:a11y https://example.com
```

**Shop test:** Walks the guest purchase path of a WooCommerce store — catalog, product pages, add to cart, cart math, and the checkout form. It stops at the payment step and never places an order:
```
/kosh:shop https://example.com
```

**AEO test:** Checks how AI tools like ChatGPT, Perplexity, and Google AI Overviews discover, parse, and cite the site:
```
/kosh:aeo https://example.com
```

Replace `https://example.com` with the URL of the site you want to test. The test will take a few minutes — kosh opens a real browser, visits 4-6+ pages, and runs checks on each one.

When it's done, you'll find the results in the `reports/` folder as both a JSON file (the raw data) and a self-contained HTML report (the formatted view).

## Step 4: Read the results

The HTML report is the easiest way to review findings. It groups issues by severity:

- **Critical:** Major problems that need immediate attention
- **High:** Significant issues that should be fixed soon
- **Medium:** Things worth addressing but not urgent
- **Low:** Minor improvements or suggestions

Open the HTML file in any browser to view it — double-click in Finder, or drag it into a browser window. The CSS is inlined so it renders the same anywhere; any screenshots attached to findings load from the adjacent `reports/screenshots/` directory, so keep the two together when sharing the report.

## Going further

The slash commands are a starting point. Once a test has run, you're in a live session with a browser and full context about what was found. You can keep the conversation going.

### Dig into a specific page or flow

If a finding catches your eye, or if a lot of changes were made to a particular page or user flow, ask kosh to investigate further:

```
Can you look more closely at the checkout flow?
```

### Ask follow-up questions about findings

kosh has the full report in context, so you can ask about anything in it:

```
What does "missing landmark regions" actually mean for users?
```

```
Are any of the critical issues related to each other, or are they independent problems?
```

### Run a focused check on something specific

You don't have to run a full test. You can ask kosh to check one thing:

```
Can you visit https://example.com/blog and check whether the post images all have meaningful alt text?
```

```
I want to know if the navigation is keyboard accessible on mobile — can you check that?
```

## Combining reports

After running the functional, performance, and accessibility tests against the same site, you can merge them into one comprehensive report:

```
/kosh:merge
```

This creates a single HTML document covering functional, performance, and accessibility findings. The shop and AEO tests aren't part of the merge — they render as standalone reports.

## Specifying the environment

If you're testing a local or development site (not the live production site), you can tell kosh so it doesn't flag expected dev-environment things as bugs:

```
/kosh:functional-design https://mysite.test local
```

The options are `local`, `development`, `staging`, or `production`.

- **Local / development:** Test data, sandbox payment gateways (Stripe test mode, PayPal sandbox), placeholder content, and debug output are treated as expected and not flagged.
- **Staging:** Should look like the live site. Test data and debug output are flagged because they shouldn't ship.
- **Production:** Everything is flagged.

If you don't specify, kosh guesses from the URL (e.g., `.test` or `.local` domains are treated as local) and defaults to production if it can't tell.

## Testing a site that isn't publicly reachable

kosh drives a real browser to the URL you give it. If the site is gated — so the browser sees a login or placeholder instead of the real site — kosh detects this and stops, rather than producing an empty or misleading report. Three common cases:

- **Coming-soon mode** — the WordPress.com "coming soon" launchpad
- **Password protection** — a single password prompt guarding the whole site
- **Private / signed-in-only** — a "This site is currently private" notice on WordPress.com

When kosh hits one of these, it tells you which gate it found and leaves the browser open. It also sends a desktop notification (and a phone push, if you have Remote Control connected) so you know it's waiting even if you've stepped away. To get past it:

1. **Log in or unlock in the open browser window.** Log in to WordPress.com (coming-soon or private sites), or type the site password (password-protected sites), in the browser window kosh opened.
2. **Tell kosh to continue.** It re-checks the page, confirms the gate is gone, and runs the test normally. Your session stays authenticated for the rest of the test.

A couple of notes:

- **Private sites need access, not just a login.** If your WordPress.com account hasn't been granted access to that specific site, logging in won't clear the gate — you'll need to request access first.
- **Unattended runs:** if no one's at the keyboard (e.g. kosh is launched from automation), pass a share/preview link that already carries access as the URL — kosh uses it directly. Don't store site passwords or account credentials in the repo.

## Tips

- **JSON reports are overwritten on each run.** If you want to keep a report, rename or move the file before testing a different site.
- **You can re-run a single test** without re-running the others. Each test is independent.
- **The browser stays open** after a test finishes, so follow-up questions and focused checks don't need to start from scratch.
