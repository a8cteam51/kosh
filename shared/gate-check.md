## Reachability Gate Check — MANDATORY before any testing

Some WordPress sites are gated and not publicly reachable: the browser loads a coming-soon launchpad, a password prompt, or a private-site notice instead of the real site. Others have moved, and the URL redirects to another host. Testing either produces an empty or misleading report. **After the first navigation to the homepage, before any other step, run this check** with `browser_evaluate`, passing the URL you were asked to test:

```javascript
() => __kosh.gate("<the URL you were asked to test>")
```

It returns `{ gate, redirectedTo }`. If `__kosh` is not defined, the browser was started without kosh's init script (`collectors/kosh.js`): stop and tell the user.

If both are `null`, proceed with testing normally.

If `gate` is set (`coming-soon`, `password-protected` or `private`), **do NOT generate a report.** Stop and tell the user which gate was detected, then offer the bypass:

- **Interactive (default):** Fire a `PushNotification` so the user is alerted even if they've stepped away (e.g. `kosh: site is gated (private) — log in in the open browser, then say continue`). Tell the user the site is gated and that the browser is left open. Ask them to authenticate in that window — log in to WordPress.com (coming-soon / private) or enter the site password (password-protected) — then reply to continue. When they continue, re-run the check above and only proceed once both fields are `null`. If `gate` is still set, report that authentication didn't clear the gate and stop.
- **Unattended (e.g. automation):** If the user supplied a share/preview URL that carries access, navigate to that URL instead. Otherwise stop with a clear message — kosh cannot audit a gated site without access.

Private sites require access, not just a login: if the WordPress.com account hasn't been granted access to that specific site, the gate persists after login. That's a site-permission issue, not a kosh issue.

If `redirectedTo` is set, **do NOT generate a report** either: the site now lives on another host, and a report would measure a site other than the one requested. Stop and tell the user the URL redirects to `redirectedTo`, so they can re-run the test against it.
