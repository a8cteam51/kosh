## Reachability Gate Check — MANDATORY before any testing

Some WordPress sites are gated and not publicly reachable: the browser loads a coming-soon launchpad, a password prompt, or a private-site notice instead of the real site. Testing the gate produces an empty or misleading report. **After the first navigation to the homepage, before any other step, run this check.**

Read the gate signals with `browser_evaluate` — do **not** rely on the page title, which stays the real site title for two of the three gates:

```javascript
() => ({
  bodyClass: document.body.className,
  url: location.href,
  title: document.title,
})
```

A gate is present if any of these match:

| Gate | Match on |
|---|---|
| **Coming soon** | `bodyClass` contains `wpcom-coming-soon-body` |
| **Password protected** | `bodyClass` contains `login-password-protected`, or `url` contains `password-protected=login` |
| **Private / signed-in-only** | `bodyClass` contains `private-login`, or `title` is exactly `Private Site` |

If none match, proceed with testing normally.

If a gate IS present, **do NOT generate a report.** Stop and tell the user which gate was detected, then offer the bypass:

- **Interactive (default):** Fire a `PushNotification` so the user is alerted even if they've stepped away (e.g. `kosh: site is gated (private) — log in in the open browser, then say continue`). Tell the user the site is gated and that the browser is left open. Ask them to authenticate in that window — log in to WordPress.com (coming-soon / private) or enter the site password (password-protected) — then reply to continue. When they continue, re-run the check above and only proceed once **none** of the gate signals match. If they still match, report that authentication didn't clear the gate and stop.
- **Unattended (e.g. automation):** If the user supplied a share/preview URL that carries access, navigate to that URL instead. Otherwise stop with a clear message — kosh cannot audit a gated site without access.

Private sites require access, not just a login: if the WordPress.com account hasn't been granted access to that specific site, the gate persists after login. That's a site-permission issue, not a kosh issue.
