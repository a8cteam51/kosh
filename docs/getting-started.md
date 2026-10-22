# Getting Started with kosh

A step-by-step guide to installing and running your first test with kosh.

## What you'll need

Before you start, make sure you have the following installed:

1. **Claude Code:** Anthropic's CLI tool. If you don't have it yet, head to [claude.ai/code](https://claude.ai/code) and follow the install instructions for your platform. You'll need version 2.1.275 or later: check with `claude --version`, and update with `claude update`.

2. **Node.js:** Runs the browser kosh drives and generates the reports, and Claude Code uses its `npm` to install the one library kosh needs. Download it from [nodejs.org](https://nodejs.org) if you don't already have it. The LTS version is fine.

3. **Git:** Claude Code uses it to download kosh. Most Macs have it pre-installed. To check, open Terminal and type `git --version`. If you see a version number, you're good.

## Step 1: Install kosh

Start Claude Code (`claude` in your Terminal) in any folder, and run:

```
/plugin install kosh --marketplace a8cteam51/kosh
```

Claude Code shows the marketplace it found, `a8cteam51/kosh`, and asks you to confirm adding it. Then it opens kosh's details: choose **Install for you**, so kosh is there whichever folder you start Claude Code in. Claude Code also installs the one library kosh uses to check each report's JSON before turning it into HTML, so there's nothing else to install.

Type `/kosh:` to check: the five tests should be listed. If they aren't, restart Claude Code.

### Keep kosh up to date

Claude Code doesn't update kosh by itself until you turn that on: run `/plugin`, open the **Marketplaces** tab, select **kosh**, then **Enable auto-update**. To update by hand instead, open kosh on the **Installed** tab in `/plugin` and select **Update now**, or run `claude plugin update kosh@kosh` in your Terminal. Either way, restart Claude Code afterwards: a session keeps the version it started with.

## Step 2: Start Claude Code in your project

kosh saves its reports in a `kosh-reports/` folder inside the folder you start Claude Code in, so start it where you want them: the site's own code, or a folder you keep for test results.

```bash
cd ~/path/to/your-project
claude
```

`kosh-reports/` gets its own `.gitignore`, so reports, which hold client URLs and console output, don't get committed by accident. If kosh's browser tools are missing, check that `/mcp` lists `plugin:kosh:playwright` as connected.

### Browser permissions

Each test pre-approves the browser tools it uses (navigating to pages, taking screenshots, clicking links, etc.) for that run, so they don't stop to ask. They do ask, once per tool, when you carry on after kosh pauses for a login (see [Testing a site that isn't publicly reachable](#testing-a-site-that-isnt-publicly-reachable)) and in follow-up questions after a test. Choose **Yes, and don't ask again** to stop the asking in that project. To allow kosh's browser tools in every folder, add the rules from kosh's [`.claude/settings.json`](https://github.com/a8cteam51/kosh/blob/trunk/.claude/settings.json) to the `permissions.allow` list in your own `~/.claude/settings.json`.

kosh also asks before it saves a report and runs its own scripts. **Yes, and don't ask again** on a script lasts until the next kosh update, since the script's path includes kosh's version.

## Step 3: Run a test

kosh has five tests. Each one takes a URL — the site you want to test.

**Functional & design test:** Checks user journeys, layout, links, metadata, and content:
```
/kosh:functional-design https://example.com
```

**Performance test:** Measures LCP, CLS and load timings, and finds console errors and failed requests, across the site's key pages at desktop and mobile:
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

When it's done, you'll find a self-contained HTML report (the formatted view) in the `kosh-reports/` folder, and its JSON (the raw data) under the same name in `kosh-reports/data/archive/`.

## Step 4: Read the results

The HTML report is the easiest way to review findings. It groups issues by severity:

- **Critical:** Major problems that need immediate attention
- **High:** Significant issues that should be fixed soon
- **Medium:** Things worth addressing but not urgent
- **Low:** Minor improvements or suggestions

Open the HTML file in any browser to view it — double-click in Finder, or drag it into a browser window. The CSS and any screenshots attached to findings are embedded in the file, so it renders the same anywhere and you can share it on its own — drop it into Slack or email and the recipient sees everything. Click a screenshot to expand it to full size.

## Going further

The tests are a starting point. Once a test has run, you're in a live session with a browser and full context about what was found. You can keep the conversation going.

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
2. **Tell kosh to continue.** It re-checks the page, confirms the gate is gone, and runs the test normally. You stay logged in while that browser window stays open, and later tests in the same session share it, cookies and cache included. Closing the window or starting a new Claude Code session gives you a fresh browser with no logins, so you'll log in again.

A couple of notes:

- **Private sites need access, not just a login.** If your WordPress.com account hasn't been granted access to that specific site, logging in won't clear the gate — you'll need to request access first.
- **Moved sites:** if the URL redirects to another host (say the site moved to a custom domain), kosh stops and tells you where it landed, rather than testing a site you didn't ask for. Re-run with the new URL. A redirect between `example.com` and `www.example.com`, or from `http` to `https`, isn't a move.
- **Unattended runs:** if no one's at the keyboard (e.g. kosh is launched from automation), pass a share/preview link that already carries access as the URL — kosh uses it directly. Don't store site passwords or account credentials in the repo.

## Tips

- **Every run's JSON is kept** in `kosh-reports/data/archive/`, named to match its HTML report. A same-day rerun of the same site keeps the earlier copy with its timestamp appended.
- **Beside it, a `.capture.jsonl` file** holds what the browser itself recorded on that site's pages during the run: load timings, LCP and CLS, console errors and warnings, and failed requests. Requests Claude made itself, like fetching the sitemap, are marked in it and left out of the page table. A performance report's page table is built from it, and Claude can read it but isn't allowed to change it, so it stays a record of what happened.
- **To re-render an archived report**, run `node ~/.claude/plugins/cache/kosh/kosh/<version>/scripts/generate-report.js kosh-reports/data/archive/<name>.json --<type>` from your project folder, with the version `claude plugin list` shows for kosh, and the type in its name (`--functional`, `--performance`, `--accessibility`, `--shop` or `--aeo`), so reports of different types don't share an HTML name. A report saved before kosh's checks changed is refused; add `--skip-validation` to render it anyway. Its screenshots are embedded from `kosh-reports/screenshots/` as it is now, so a later run may have replaced them.
- **The browser's own files**, the page snapshots and console logs Playwright saves as it goes, are kept outside your project, in a `playwright-mcp` folder under `~/.claude/plugins/data/`. They hold the text of the pages tested, so the oldest are deleted once the folder passes 20 MB; delete it yourself if you need them gone sooner.
- **You can re-run a single test** without re-running the others. Each test is independent.
- **The browser stays open** after a test finishes, so follow-up questions and focused checks don't need to start from scratch.
- **Restart Claude Code after updating kosh.** A session keeps the browser setup it started with, so after an update an open session still runs the old one. If a test stops because `__kosh` isn't defined, that's why: exit and start Claude Code again.
- **Used kosh from a clone before?** Its reports stay in that clone, in `kosh-reports/` (or `reports/`, from before 1.4.0). The HTML reports embed their screenshots, so they open fine wherever you move them. Once you've kept what you need, the clone can go: you no longer start Claude Code in it or pass `--plugin-dir`.
- **Run shop tests in their own Claude Code session.** A second run in the same session inherits the first one's cart, and can miss prices that change once something is in it. The performance test closes the browser before it starts so its timings are cold, which means a gated site you logged into earlier in the session asks for the login again.
