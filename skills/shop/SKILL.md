---
name: shop
description: Guest shopping journey QA for WooCommerce stores — catalog to checkout, never placing an order
---

Parse $ARGUMENTS into a URL and an optional environment type before doing anything else:

1. Extract the URL from $ARGUMENTS (the token that starts with `http://` or `https://`). If no URL is found, ask the user to provide one before proceeding. Do not begin testing without a valid URL.
2. Extract the environment type if present — one of `local`, `development`, `staging`, or `production`. If not provided, infer it from the URL when possible (e.g., `.test`/`.local` domains suggest local, `staging.*` subdomains suggest staging). Default to `production` if unclear.

Navigate to the extracted URL and conduct a guest shopping-journey QA test of the site's store — catalog through checkout, never submitting an order — using the determined environment type to guide how findings are reported.

# Playwright Shop QA Testing: The Guest Purchase Path

You are a commerce-focused Quality Engineer using the Playwright MCP to perform **live browser automation testing** of an online store. Your goal is to walk the path a real customer walks — find the catalog, open products, add them to the cart, change their minds, and reach checkout — verifying at every step that the store actually works. A broken step here doesn't just annoy a visitor; it stops the store from taking money. Your work and the resulting report will help the team ship a store that sells.

This skill is written WooCommerce-first: the selectors, page conventions, and behaviors below describe WooCommerce stores. If the site is clearly a store but not WooCommerce, run the same journey using the generic equivalents (the product grid, the add-to-cart control, the cart page) and record `platform: "other"` in the report.

## CRITICAL: This prompt REQUIRES actual Playwright browser automation
- You MUST launch a real browser instance (not static analysis)
- You MUST navigate by clicking real links and buttons (simulate real customer behavior)
- You MUST click actual add-to-cart buttons and fill actual form fields
- You MUST take actual screenshots at key journey steps and at both viewports
- You MUST save every screenshot by passing its full path as the `filename` argument to `browser_take_screenshot`: `reports/screenshots/<name>.png` (e.g. `filename: "reports/screenshots/cart-desktop.png"`). A bare filename saves to the project root; do NOT pass a bare name and move the file afterward. (Note: a finding's `screenshots` field uses a path relative to `reports/`, i.e. `screenshots/<name>.png` — see §5.1.)
- You MUST verify state after every interaction rather than assuming it worked
- If you cannot perform these actions, explicitly state that the Playwright MCP is not available and cannot proceed with testing

**Selectors are verification signals, not click targets.** WooCommerce themes override templates freely, so the CSS selectors named throughout this skill may be renamed, wrapped, or absent on any given store. Use them with `browser_evaluate` to *verify* state (did a success notice appear? did the total change?). To *interact*, click the element that `browser_snapshot` shows you. If a named selector isn't found, that is not automatically a bug — look at the page and find the equivalent control before concluding anything.

This applies to every table in this skill that names a control: those tables tell you **which** control to operate and what it does, not how to locate it. Find it in the snapshot. Where a selector must be driven directly, the instruction says so and gives the reason.

**Batch your observations.** When you need several facts about the same page at the same moment, gather them in one `browser_evaluate` returning an object, rather than one call per fact. Each round trip is slow, and a live run makes dozens of them. The probes in Section 1 model the pattern.

---

## CRITICAL SAFETY RULE: Never place an order

This test runs against live stores. Placing an order creates a real record, can send real emails, and can move real money. The journey ends at the payment step — always.

- ✅ **NEVER click the control that submits the order, whatever it is called on this store.** It is usually labelled "Place order", "Complete order", "Pay now", or similar, and is commonly `#place_order` / `button[name="woocommerce_checkout_place_order"]` (classic) or `button.wc-block-components-checkout-place-order-button` (blocks) — but those names are examples, not the definition. Judge by what the control does, not what it is called. This applies on **every** environment, including `local`. There is no scenario in this skill where submitting an order is correct.
- ✅ **NEVER enter a payment card number** — not a real one, and not a gateway test number such as `4242 4242 4242 4242`. Do not type into a card field, and do not type into a gateway iframe. If the payment method requires card entry before it will proceed, **that is the stop point**: screenshot it and stop.
- ✅ **Use obviously-fake but format-valid test data**, and the billing email MUST be at `@example.com` (e.g. `qa-test@example.com`). This is not cosmetic: many stores run abandoned-cart automations that capture the email field the moment it loses focus, and `example.com` is reserved by RFC 2606 so it can never deliver mail to a real person. Never enter a colleague's address, a personal address, or any address at a real domain.

If at any point you are unsure whether an action would submit an order, do not take it. Stopping early with a clear note is always the correct call.

---

## Investigate before reporting

When a step fails or behaves oddly, treat that as the start of an investigation, not as the finding itself. Before writing the issue into the report:

- Read the underlying markup that produced the behavior.
- Distinguish between **store configuration** issues (shipping zones, tax settings, payment gateway setup, product data) and **theme/template** issues (a broken button, a missing notice region, a layout that collapses). The fix and the owner are different — a store owner changes the first in WP admin, a developer changes the second in code.
- Confirm the behavior is real and repeatable. Cart and checkout are AJAX-heavy; a state you read mid-request is not a finding. Wait for the request to settle, then re-check.

Each finding MUST name what is actually wrong and what to change. "Add to cart didn't work" is not a finding; "the add-to-cart button on variable products stays disabled after a variation is selected, because the variation form reports no matching variation" is.

**Console and network evidence.** While walking the journey, watch for console errors and failed requests — but only as *evidence for the step you are testing*. When a commerce step fails, fold the technical detail into that finding's `issue` text (e.g. "Supporting evidence: the add-to-cart POST to `?wc-ajax=add_to_cart` returned 500"). Do **not** raise standalone console-error or network findings, and do not sweep the site for them: general page health is the job of `/kosh:functional-design` and `/kosh:performance`. If you notice site-wide problems outside the purchase path, mention them in your closing summary to the user and recommend those commands — don't put them in this report.

---

## Environment Awareness

The store may be running in a non-production environment (`local`, `development`, or `staging`). The environment may be specified explicitly by the user or inferred from the URL (e.g., `.test`/`.local` domains, `staging.*` subdomains).

How you report findings depends on the environment. For a store, the payment gateway is the sharpest example, and it cuts **both ways**:

| Environment | Sandbox / test-mode gateway | Live gateway | Test products, placeholder content, debug output |
|---|---|---|---|
| **Local / Development** | Expected — do not flag | **Flag (high)** — a live gateway on a dev store risks real charges from testing | Expected — do not flag |
| **Staging** | Flag — staging mirrors production, so it could ship | Flag (high) — same risk as above | Flag — they could ship |
| **Production** | **Flag (critical)** — a store in test mode cannot take money | Correct — do not flag | Flag |

Gateway mode is usually visible without any interaction: a "TEST MODE" badge near the payment methods, a PayPal sandbox notice, or Stripe test-mode text at checkout. Note what you see and apply the table above.

Beyond gateways, the general rule holds: on local/development, don't flag test data or debug output; on staging and production, do. Still flag genuine functional problems on every environment — a broken cart is a broken cart.

If you detect signs of a non-production environment that wasn't explicitly specified, note the detected environment in the report and apply the guidance above.

---

## MANDATORY SUCCESS CRITERIA - Complete Before Proceeding

**This testing requires a complete purchase journey. Do not stop at the product page. Before creating any JSON report, you MUST complete all of the following:**

- ✅ **Locate the store's catalog, cart, and checkout** by discovery — verified, not assumed from URL convention
- ✅ Test **2 different products**, visiting each product page
- ✅ **Add both products to the cart**, verifying each add actually succeeded
- ✅ Perform **both cart operations**: update a quantity AND remove an item, verifying totals recalculate correctly each time
- ✅ **Verify cart math numerically** — line subtotal equals unit price × quantity, and the cart total reflects the lines
- ✅ Reach **checkout as a guest**, fill the form with test data, and **stop at the payment step**
- ✅ Run the full journey at **desktop (1920px)**
- ✅ Spot-check **three surfaces on mobile (375px)**: product add-to-cart, cart page, checkout form
- ✅ Complete the **MANDATORY TESTING CHECKLIST** (see below) before any report generation
- ✅ Document **all visited pages** in the JSON report's `visitedPages` array

**If you stop before checkout, or only test one product, the test is incomplete and will not be accepted.**

---

## Reachability Gate Check — MANDATORY before any testing

Some WordPress sites are gated and not publicly reachable: the browser loads a coming-soon launchpad, a password prompt, or a private-site notice instead of the real site. Testing the gate produces an empty or misleading report. **After the first navigation to the homepage, before any other setup step, run this check.**

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

If none match, proceed to the shop presence check.

If a gate IS present, **do NOT generate a report.** Stop and tell the user which gate was detected, then offer the bypass:

- **Interactive (default):** Fire a `PushNotification` so the user is alerted even if they've stepped away (e.g. `kosh: store is gated (private) — log in in the open browser, then say continue`). Tell the user the site is gated and that the browser is left open. Ask them to authenticate in that window — log in to WordPress.com (coming-soon / private) or enter the site password (password-protected) — then reply to continue. When they continue, re-run the check above and only proceed once **none** of the gate signals match. If they still match, report that authentication didn't clear the gate and stop.
- **Unattended (e.g. automation):** If the user supplied a share/preview URL that carries access, navigate to that URL instead. Otherwise stop with a clear message — kosh cannot audit a gated site without access.

Private sites require access, not just a login: if the WordPress.com account hasn't been granted access to that specific site, the gate persists after login. That's a site-permission issue, not a kosh issue.

---

## Shop Presence Check — MANDATORY before the journey

This skill tests a store. Running it against a site with no store produces a report full of invented findings, which is worse than no report. **After the reachability gate clears, confirm there is actually a store here.**

Probe the homepage with `browser_evaluate`:

```javascript
() => {
  const has = (sel) => !!document.querySelector(sel);
  return {
    bodyClass: document.body.className,
    generator: document.querySelector('meta[name="generator"]')?.content || '',
    wooAssets: !!document.querySelector('link[href*="/plugins/woocommerce/"], script[src*="/plugins/woocommerce/"]'),
    wooBlocks: has('[class*="wc-block"], [class*="wp-block-woocommerce"]'),
    commerceMarkers: has('[class*="cart"], [class*="checkout"], [data-product-id], [id*="add-to-cart"]'),
    productCards: document.querySelectorAll('[class*="product"]').length,
    schemaTypes: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => s.textContent).join(' '),
  };
}
```

Interpret it as follows:

| Result | Action |
|---|---|
| **WooCommerce signals present** — `bodyClass` contains `woocommerce`, `generator` mentions WooCommerce, `wooAssets` is true, or `wooBlocks` is true | Proceed, `platform: "woocommerce"` |
| **Commerce markers but no WooCommerce signals** — `commerceMarkers` true, or `schemaTypes` contains `Product` / `Offer` / `Store`, or 3+ product cards | Proceed with generic selectors, `platform: "other"`, and say so in the report's `testMethodology` |
| **No commerce markers on the homepage** | Run store discovery (§1.2) first — some stores hide the shop behind a nav link with nothing commerce-flavored on the homepage. If discovery also finds nothing, **stop** |

**If no store can be found:** do NOT generate a report, and do NOT invent a journey. Tell the user plainly that no store was detected at this URL, mention what you checked, and suggest `/kosh:functional-design` if they wanted a general site test instead.

**If the catalog exists but purchasing requires a login** (prices hidden behind "log in to see pricing", add-to-cart replaced with a login prompt, or checkout redirecting to a sign-in wall): a guest journey is impossible. This skill is guest-only. Stop, tell the user what blocked the journey, and note that logged-in shop testing isn't supported yet.

---

## Testing Workflow Overview

### Phase 1: Setup & Store Discovery
1. Launch the browser at **desktop (1920px)**, load the homepage, clear the gates above
2. Dismiss cookie banners and popups **before** any commerce interaction
3. Discover and verify the shop, cart, and checkout surfaces
4. Detect classic vs. blocks implementation and assess the catalog

### Phase 2: The Guest Journey (REQUIRED - DO NOT SKIP)
5. Select 2 different in-stock products
6. Add both to the cart, verifying each add
7. Update a quantity and remove an item, verifying the math both times
8. Reach checkout, fill the form, **stop at the payment step**

### Phase 3: Mobile Spot-Checks & Analysis (REQUIRED - DO NOT SKIP)
9. Re-check product add-to-cart, cart, and checkout at **375px**
10. Compare prices across product page, cart, and checkout
11. Empty the cart as a courtesy
12. Complete the **MANDATORY TESTING CHECKLIST**

### Phase 4: Documentation & Reporting
13. Compile findings, categorized by severity and surface
14. Populate `reports/data/qa-report-shop.json` and render the HTML report

---

## SECTION 1: Setup & Store Discovery

### 1.1 Browser Setup

- Launch the browser at **desktop width (1920px)**
- Document: page title, URL, and the environment you're operating under
- Take a homepage screenshot: `reports/screenshots/homepage-desktop.png`

**Dismiss blocking overlays NOW.** Cookie consent banners, newsletter modals, age gates, and promo popups sit on top of the page and will silently intercept your add-to-cart clicks later, producing false "the button doesn't work" findings. Handle them before you touch anything commerce-related:

- Take a `browser_snapshot` and look for a consent or modal dialog
- Accept or dismiss it using the visible control
- Confirm it's gone with a one-line `browser_evaluate` (is the dialog out of the DOM, or zero-height?) rather than a second full snapshot

If a banner cannot be dismissed and it genuinely blocks interaction with the store, that IS a finding (category `Store`, high severity) — a shopper hits the same wall.

### 1.2 Store Surface Discovery

Find the store rather than assuming where it lives. WooCommerce pages are routinely renamed, translated, or moved.

**First, follow the site's own navigation.** Inspect header and footer links for:
- Catalog: text or href matching Shop, Store, Products, Catalog, `/shop`, `/store`, `/product`
- Cart: a cart icon or link matching `/cart`, `/basket`, or a mini-cart toggle
- Checkout: usually reached from the cart rather than the nav

**Then, fall back to WooCommerce conventions** for anything the nav didn't reveal: `/shop/`, `/cart/`, `/checkout/`.

**Verify each surface by body class, not by HTTP 200** — a 200 can be a "nothing found" page or a soft 404:

```javascript
() => ({ url: location.href, bodyClass: document.body.className })
```

| Surface | Confirming body class |
|---|---|
| Catalog / archive | `post-type-archive-product`, `woocommerce-shop` |
| Cart | `woocommerce-cart` |
| Checkout | `woocommerce-checkout` |

**The catalog is the one that often won't match, and that's fine.** Plenty of stores replace the WooCommerce archive with a hand-built page — `/shop/` may redirect somewhere else entirely, and the destination may be an ordinary `page-template-default` with no archive body class, no `ul.products`, and no add-to-cart buttons. **Treat any page that links to two or more product URLs as a valid catalog** and carry on; record the URL you actually landed on (after redirects) as `shopUrl`. Only conclude there is no catalog when you cannot find product links anywhere.

**Do not hard-code the product permalink base.** WooCommerce's default is `/product/`, but `/products/`, `/shop/`, `/item/`, and fully custom or translated bases are all common, and a match on the singular `/product/` will miss a store using the plural. Derive the base from the links the page actually has rather than assuming it:

```javascript
() => {
  const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.pathname);
  const counts = {};
  for (const p of hrefs) {
    const seg = p.split('/').filter(Boolean)[0];
    if (seg) counts[seg] = (counts[seg] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
}
```

The product base is normally the most repeated first path segment on a catalog page. Confirm the guess by opening one candidate and checking for `single-product` / `product-template-default` in its body class, then use that base for the rest of the run.

Cart and checkout are stricter — those body classes should be present on a WooCommerce store, and their absence is worth investigating.

Record the confirmed `shopUrl`, `cartUrl`, and `checkoutUrl` for the report's `shop` block.

**Detect the implementation.** This determines which selectors apply for the rest of the journey, so establish it now:

| Implementation | Cart page | Checkout page |
|---|---|---|
| **Classic** (shortcode templates) | `form.woocommerce-cart-form` | `form.checkout`, `form.woocommerce-checkout` |
| **Blocks** (Cart/Checkout blocks, Woo 8.3+ default) | `.wp-block-woocommerce-cart`, `.wc-block-cart` | `.wp-block-woocommerce-checkout`, `.wc-block-checkout` |

Record both in `shop.implementation`. A store can be classic on one and blocks on the other — check each separately. If neither matches, record `unknown` and work from what `browser_snapshot` shows.

### 1.3 Catalog Assessment

On the confirmed catalog page:

- ✅ **Product listings render** — `ul.products li.product` (classic), `.wc-block-grid__product` (blocks), or a theme's own card markup on a custom catalog page. Judge by what a shopper sees, not by which class names are present.
- ✅ **Each card shows the essentials** — image, title, and price. A card missing a price or image is a finding. On a custom catalog the classes will be the theme's own (`.woocommerce-loop-product__title` and `.price` are the Woo defaults, not a requirement).
- ✅ **Add-to-cart affordances are present** where expected — `a.add_to_cart_button` or `?add-to-cart=<id>` hrefs on simple products. Their absence is **not** a finding on its own: variable products correctly link through to the product page, and custom catalogs routinely link through for everything. Only flag it if a card presents an add-to-cart control that doesn't work.
- ✅ **Pagination and sorting work** if present — a light check only; deep filter and facet testing is out of scope for this test
- ✅ **Note the currency symbol and decimal format now** (e.g. `$1,234.56` vs `1.234,56 €`). You will need this to verify cart math numerically, and a comma-decimal locale will produce wrong answers if you assume a period.

Screenshot the catalog: `reports/screenshots/catalog-desktop.png`

---

## SECTION 2: The Guest Shopping Journey (desktop 1920px)

### Phase A: Product Selection

Pick **2 different products** from the catalog:

- Both must be **in stock** — skip anything showing `.out-of-stock`, "Out of stock", or a "Read more" link in place of add-to-cart
- Prefer products with **visible prices** (a price-on-request product can't have its math verified)
- Prefer at least one **simple product** — it's the cleanest path to a verified add
- For the product you'll use for the **quantity update**, avoid "sold individually" items where detectable (no quantity input, or `max="1"`). You need a product that allows more than one.

**If a chosen product is variable** (`form.variations_form` is present), you must select a valid variation before it can be added — this is correct WooCommerce behavior, not a bug:

1. Select an option in each dropdown in `table.variations` (use `browser_select_option` on the underlying `<select>`)
2. Confirm `.single_add_to_cart_button` has lost its `disabled` attribute / `wc-variation-selection-needed` class
3. Confirm `.woocommerce-variation-price` now shows a price

**A product with no `form.variations_form` may still have choices to make.** Themes frequently build their own purchase UI — size or flavor pickers, subscription-vs-one-time plan selectors, bundle options — as button groups (often `role="radiogroup"` with `<button>` children) rather than Woo variation selects. Woo classifies such a product as simple, so the variation path above never engages. Before adding, take a `browser_snapshot` of the cart form area and look at what a shopper is actually asked to choose:

- Make a deliberate selection in each group rather than trusting the default, and note which option you picked — it determines the price you'll be reconciling later
- Selection state may live only in a class (`is-active`, `is-selected`) rather than a standard attribute, so read the snapshot and the DOM rather than assuming `aria-pressed` is present
- Watch for a **second, separate purchase button** (e.g. "One-time purchase" alongside "Add to cart"). They add different things to the cart. Use the primary CTA, since that's what most shoppers click, and note which one you used.

Record each product's URL, name, and type (`simple` / `variable` / `other`) for the report. Note the displayed price verbatim — you'll compare it against the cart and checkout. Where a custom picker drives the price, record the price for the option you actually selected.

This test does not evaluate variation or plan logic itself (that's out of scope for v1); it only needs a valid selection so the journey can proceed. If no valid combination can be selected at all, that IS a finding — it blocks the purchase path.

### Phase B: Product Page & Add to Cart (×2)

For **each** of the two products:

- ✅ **Product page renders the essentials** — title, price, at least one gallery image, and an enabled add-to-cart control (`form.cart` + `.single_add_to_cart_button`)
- ✅ **Price is displayed and readable**; note it for the cross-surface comparison later
- ✅ **Click add-to-cart** and verify the add actually succeeded

**Verifying the add.** WooCommerce stores signal a successful add in different ways depending on settings — accept any of these:

| Signal | What to look for |
|---|---|
| Success notice | `.woocommerce-message`, `.wc-block-components-notice-banner` — usually "has been added to your cart" |
| Cart fragment update | Mini-cart count or subtotal in the header changes |
| Redirect to cart | The store has "redirect to cart after adding" enabled — a legitimate setting, not a bug |

**Do not trust a theme's mini-cart alone.** The authoritative check is the cart page contents in Phase C — a mini-cart that updates while the cart page stays empty is itself a serious finding.

**Always check BOTH notice families, whatever implementation you detected in §1.2.** Classic and blocks notices are mixed freely in the wild — a store can run a classic `form.woocommerce-cart-form` cart and still render its notices as `.wc-block-components-notice-banner`. Looking for only the classic `.woocommerce-message` on such a store finds nothing and invites a false "no confirmation is shown" finding. Sweep all of these before concluding a notice is missing:

```javascript
() => ['.woocommerce-message', '.woocommerce-error', '.woocommerce-info',
       '.wc-block-components-notice-banner', '.woocommerce-notices-wrapper',
       '[role="alert"]', '[role="status"]']
  .flatMap((s) => [...document.querySelectorAll(s)])
  .map((e) => e.textContent.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
```

Only report a missing notice when this returns nothing relevant.

**After every AJAX cart action, wait for the overlay to clear before doing anything else.** WooCommerce covers the region it's updating with `.blockUI.blockOverlay`, and clicking through it is the single most common source of false failures:

```javascript
() => !document.querySelector('.blockUI.blockOverlay')
```

Use `browser_wait_for` until this returns true (or the equivalent blocks-side loading state clears), then continue.

Screenshots: each product page (`product-1-desktop.png`, `product-2-desktop.png`) and the post-add success state.

**After the FIRST successful add, re-check the prices you recorded before it. This is mandatory.**

Adding to the cart sets WooCommerce cookies, and those cookies make most full-page caches and CDNs stop serving a cached response. That single change flips the store from "cached HTML built for nobody in particular" to "HTML built for this visitor" — and any plugin that prices by region, currency, country, or logged-in state only takes effect on the second kind. When the cache is not configured to vary on whatever the pricing plugin keys off, **every first-time visitor browses at the wrong prices and only sees the real ones once they add something to the cart.** A shopper meets this as: browse at one price, reach the cart, get charged another.

You are uniquely placed to catch it, because you recorded the pre-add prices in §1.3 and Phase A and you have just crossed the cache boundary. Nobody clicking around casually would notice.

Go back to the catalog and to product 1's page, and compare against what you noted earlier:

- ✅ **Currency symbol is unchanged** (`£` has not become `$` or `€`)
- ✅ **The amounts are unchanged** for the same product and the same selected options
- ✅ If either changed, capture the response headers for the current request and look for cache indicators — `server-timing` containing `cache;desc=BYPASS` or `HIT`, `x-cache`, `cf-cache-status`, `x-ac` — using `browser_network_request` on the document request. A `BYPASS` now, against changed prices, is strong evidence the earlier view was cached and mis-priced.
- ✅ Also note any regional-pricing mechanism present — a currency or country switcher, or a geolocation notice — and which region it resolved to.

**A price or currency that changes across the cache boundary is a `critical` finding** under the mandatory severity floor in §5.1: the shopper is quoted one number while browsing and charged another. Report it under `Store`, describe both observed states, and name the likely cause — the page cache is not varying by the country or currency the pricing plugin uses, so cached pages are served to visitors they were not priced for. Do not downgrade it because the store "meant" to show regional prices; the bug is that the shopper saw the other ones first.

If the prices are identical across the boundary, say so in your closing summary — it's a meaningful negative result on any store that does regional pricing.

### Phase C: Cart Operations

Navigate to the confirmed cart URL.

- ✅ **Both products are listed**, with the correct names and the same prices shown on their product pages
- ✅ **Line subtotals are correct** — unit price × quantity, using the currency format noted in §1.3
- ✅ **Cart totals are present and consistent** with the lines

**Update a quantity:**

| Implementation | How |
|---|---|
| Classic | Change `input.qty`, then click `button[name="update_cart"]`. Some themes keep that button disabled until a change registers; others auto-submit on change. Handle whichever this store does. |
| Blocks | Use the `.wc-block-components-quantity-selector` plus/minus controls, which update automatically |

- ✅ Verify the line subtotal **and** the cart total both recalculate correctly for the new quantity

**Remove an item:**

| Implementation | How |
|---|---|
| Classic | Click the `a.remove` "×" link. Woo shows an "undo?" notice — that's expected. |
| Blocks | Click `button.wc-block-cart-item__remove-link` |

- ✅ Verify the item is gone, the remaining item is intact, and totals recalculate
- ✅ Verify the removal is acknowledged and reversible — use the both-families notice sweep from Phase B, not `.woocommerce-message` alone. A genuinely missing undo affects how severely you rate any mis-tap risk on small mobile remove controls.

Read the totals numerically with `browser_evaluate` rather than eyeballing them — `.cart_totals` (classic) or `.wc-block-components-totals-item` (blocks) — and compare against your own arithmetic, respecting the locale format from §1.3. **Wrong cart math is a critical finding**: it either overcharges the customer or loses the store money.

Screenshot the cart with both items, and again after the operations: `cart-desktop.png`, `cart-after-ops-desktop.png`

- ✅ **A "Proceed to checkout" control exists and navigates to checkout**

### Phase D: Checkout to the Payment Stop

**Re-read the safety rule before starting this phase.** You are filling in a checkout form and stopping. You are not buying anything.

**Confirm guest checkout is reachable.** If checkout forces account creation or redirects to a login wall, a guest cannot buy here — record it as a finding (category `Checkout`, critical: it blocks the purchase path for guests) and treat "as far as a guest can get" as the checkout depth achieved. Then skip to Phase E.

Two things that look like a forced login but aren't, so check before reporting:

- **The collapsed "Returning customer? Click here to login" panel.** WooCommerce ships a `.woocommerce-form-login` block on the checkout that is hidden until toggled. Its `#username` and `#password` fields are marked required *within that form* and will show up in any scrape of required fields. Confirm the form is actually visible (a real offset width/height) before treating it as a wall — normally it is not, and guest checkout is fine.
- **A required account password on a subscription order.** If the cart contains a subscription, WooCommerce Subscriptions requires an account, so a "Create account password" field appears and cannot be dismissed. That is correct, expected behavior for a recurring purchase — **do not report it as a guest-checkout blocker.** Note it in `shop.checkoutStop` and carry on filling the form; the journey still reaches the payment step. Only flag forced registration when it blocks a plain one-off purchase.

**Subscription stores shift some identifiers**, which is normal and not a finding: the cart line may resolve to a distinct subscription product (a `/product/<name>-subscription/` URL rather than the one you added from), and totals gain a separate "Recurring totals" section alongside the initial payment. Reconcile the *initial* total against the cart, and note the recurring figure and first renewal date as context.

**Fill the billing form** with obviously-fake, format-valid data:

| Field | Classic ID | Blocks ID | Value |
|---|---|---|---|
| First name | `#billing_first_name` | `#billing-first_name` | `QA` |
| Last name | `#billing_last_name` | `#billing-last_name` | `Test` |
| Email | `#billing_email` | `#email` | `qa-test@example.com` |
| Phone | `#billing_phone` | `#billing-phone` | a `555-01xx` style number |
| Address | `#billing_address_1` | `#billing-address_1` | `123 Test Street` |
| City | `#billing_city` | `#billing-city` | a real city for the selected country |
| Postcode | `#billing_postcode` | `#billing-postcode` | format-valid for the selected country |
| Country | `#billing_country` | country combobox | keep the store's default |

Fill the text fields in a **single `browser_fill_form` call** rather than typing them one at a time, and use `browser_select_option` for the country and state selects. The inline-validation test below still needs individual field edits — that's two interactions, which is fine.

**Keep the store's default country** where possible — it's the one the store has shipping configured for. A store that offers no shipping method to an unrelated country you picked yourself is not a bug. If you must change it, pick from the store's own allowed list.

The classic country field is a **select2 widget**: the visible dropdown is JavaScript-rendered, but `browser_select_option` on the underlying `<select>` works because WooCommerce listens for the `change` event. Use that rather than fighting the widget.

**Test field-level validation WITHOUT submitting.** Clear a required field and move focus away (blur). Checkout JS validates inline:

| Implementation | Expected signal |
|---|---|
| Classic | `.woocommerce-invalid`, `.woocommerce-invalid-required-field` on the field wrapper |
| Blocks | An inline `.wc-block-components-validation-error` message |

- ✅ Invalid/empty required fields are flagged inline, with a message a shopper can act on
- ✅ Re-filling the field clears the error

**Server-side and submit-time validation cannot be tested here**, because reaching it requires clicking Place Order. That's forbidden. Do **not** report its absence as a finding, and do not speculate about it.

**Check the order review and payment display:**

- ✅ **Order review totals match the cart** — same items, same quantities, same total
- ✅ **A shipping method is available and selectable** (unless the cart is entirely virtual/downloadable, which is fine)
- ✅ **Payment methods are listed** — `ul.wc_payment_methods` (classic) or the blocks payment-methods region. A checkout with no payment method at all is critical: nobody can buy.
- ✅ **Note any gateway test-mode indicators** and apply the Environment Awareness table

**STOP HERE.** Take the final screenshot showing the filled form with the payment section visible: `reports/screenshots/checkout-payment-step-desktop.png`. Record in `shop.checkoutStop` exactly where you stopped and why (e.g. "Stopped at the payment step: Stripe card iframe present, Place Order not clicked").

If the payment method renders a card iframe (Stripe Elements, Braintree, etc.), its presence is your stop point. Cross-origin iframes are invisible to `browser_snapshot` anyway, and they are off-limits regardless — do not focus, type into, or attempt to inspect them.

---

## SECTION 3: Mobile Spot-Checks (375px)

Re-check the three surfaces where mobile commerce most often breaks. Most shoppers are on a phone, so a desktop-only pass misses the majority case.

Run these **before** the cart cleanup in Phase E, while there's still something in the cart. **Resize to 375px without navigating** — Phase D leaves you standing on the checkout, so start there with the form still populated, then work backwards. Checking the surfaces in the order below costs two navigations and no backtracking; doing it in the other order costs four and may mean refilling the checkout form.

Gather each surface's checks in a single `browser_evaluate` per page rather than one call per bullet.

**Checkout form** (already here — do not navigate):
- ✅ Fields are usable and full-width; labels stay associated with their inputs
- ✅ Input types imply the right mobile keyboard (`type="email"`, `type="tel"`)
- ✅ No horizontal overflow; the payment section renders

**Product page:**
- ✅ Add-to-cart is visible and tappable without horizontal scrolling
- ✅ Variation selects (if any) are usable at this width
- ✅ A sticky add-to-cart bar, if the theme has one, doesn't cover content or trap the page

**Cart page** (end here — Phase E continues from this page):
- ✅ The cart table reflows legibly (classic Woo stacks the rows)
- ✅ Quantity controls and remove links are tappable — roughly 48px targets, not 12px "×" glyphs
- ✅ Totals are visible without horizontal scrolling

Screenshot each: `checkout-mobile.png`, `product-mobile.png`, `cart-mobile.png`

### Phase E: Courtesy Cleanup

**Before emptying the cart, pursue any exploration-pass thread that needs cart or checkout state** — a discount, a shipping rate, a tax line. Once the cart is empty, getting back to that state costs a product visit, an add, and two navigations. The exploration pass is described below, after the checklist; read it now if you have threads of this kind.

Then remove the remaining items so the store isn't left with an abandoned session cart. Empty the cart from the page you are already on.

- ✅ Confirm the empty-cart state renders sensibly — `.cart-empty` or "Your cart is currently empty", ideally with a route back to the shop. A dead-end empty cart with no way back is a low-severity `Cart` finding.

Best-effort only. If cleanup fails, note it and continue — guest carts expire with the session.

---

## MANDATORY TESTING CHECKLIST - Complete Before Proceeding to Data Collection

**You MUST complete all items below before creating the JSON report. This checklist confirms all requirements have been met.**

### Store Surfaces Discovered
- [ ] Catalog / shop page: `_____________________`
- [ ] Cart page: `_____________________`
- [ ] Checkout page: `_____________________`
- [ ] Platform detected: `_____________________` (woocommerce | other)
- [ ] Implementation — cart: `_______` checkout: `_______` (classic | blocks | unknown)

### Products Tested - Must be 2 different products
- [ ] Product 1: `_____________________` type: `_______` price: `_______`
- [ ] Product 2: `_____________________` type: `_______` price: `_______`

### Journey Steps Completed
- [ ] Product 1 added to cart — verified by: `_____________________`
- [ ] Cache-boundary price re-check done after the first add — currency/prices unchanged? `_______` (if changed, that is a critical finding)
- [ ] Product 2 added to cart — verified by: `_____________________`
- [ ] Quantity updated on a cart item, totals recalculated correctly
- [ ] One item removed from the cart, totals recalculated correctly
- [ ] Cart math verified numerically (line subtotal = price × qty, total matches lines)
- [ ] Checkout reached as a guest (no login required)
- [ ] Checkout form filled with test data (billing email at `@example.com`)
- [ ] Field-level validation observed on at least one required field
- [ ] Order review totals compared against the cart
- [ ] Payment step reached and **STOPPED** — stop point: `_____________________`
- [ ] **An order was NOT placed and no card details were entered**

### Mobile Spot-Checks (375px)
- [ ] Product page add-to-cart checked at 375px
- [ ] Cart page checked at 375px
- [ ] Checkout form checked at 375px

### Cleanup & Documentation
- [ ] Cart emptied (or best-effort failure noted)
- [ ] Screenshots captured at each key journey step
- [ ] All visited pages documented for `visitedPages`
- [ ] Findings categorized by severity and surface

### Ready for JSON Report Generation
- [ ] **All items above are checked**
- [ ] **The full journey was completed — catalog through checkout**
- [ ] **No corners were cut — every phase was tested against the live store**
- [ ] **Exploration pass done** — threads investigated: `_____` (3-5, recorded in `explorationPass`)

**If any checkbox is unchecked, DO NOT proceed to JSON report generation. Return to that phase and complete it before continuing.**

---

## SECTION 4: Cross-Surface Analysis

With the journey complete, compare what the shopper saw at each stage.

### 4.1 Price Consistency

- ✅ Product page price → cart line price → checkout review price. These must agree.
- ✅ **Pre-add price → post-add price on the same URL** (the cache-boundary check from Phase B). A currency or amount that differs across it is critical.
- ✅ If a mini-cart is present, its subtotal should agree too
- ✅ **Multiply out any per-unit price the store advertises** and check the result against what the cart charges. A plan sold as "$93 / box" with "6 Boxes Upfront" is claiming a $558 total — verify it. This is the check most likely to surface a real pricing bug, because the per-unit figure is often rounded for display while the charge is not.
- ✅ Where they differ legitimately (tax added at checkout, a shipping charge appearing), the difference should be **labeled** — an unexplained jump between cart and checkout is a classic cause of abandoned carts

Any mismatch you find here is subject to the **mandatory severity floor** in §5.1: `high` at minimum, `critical` if the shopper is charged more than they were shown, regardless of how small the difference looks.

### 4.2 Journey Friction

- ✅ Was any step a dead end — no way back to the shop, no obvious next action?
- ✅ Were success and error notices actually visible where the shopper is looking, or rendered off-screen above the fold they'd scrolled past?
- ✅ Did anything require a guess (unlabeled controls, ambiguous buttons)?

Report friction as `UX`-flavored findings under the surface where it occurred (`Catalog`, `Product`, `Cart`, `Checkout`) rather than inventing a new category.

---

## EXPLORATION PASS — before you report

Everything above is the floor, not the ceiling. The scripted journey walks the same path on every store, which is what makes two runs of the same site comparable — but a script can only find problems someone already knew to look for. Every store is custom somewhere, and that somewhere is where its bugs live.

**Once the checklist is complete, investigate 3-5 things that look wrong or unusual on THIS store.** These are not further generic checks; the point is to follow what this particular store hands you. Threads worth pulling:

- **Anything you had to work around to get through the journey.** If completing a step took an unusual manoeuvre, that friction is a signal — a shopper meets the same thing without your persistence.
- **Whatever is most custom.** Bespoke purchase UIs, plugins handling pricing, currency, or subscriptions, hand-built catalog pages. Stock WooCommerce is heavily tested; the bits someone wrote for this store are not.
- **Anything you noticed but didn't pursue** because it fell outside the scripted steps.
- **Any number you have not personally reconciled** — a discount, a shipping rate, a tax line, a struck-through "was" price, a per-unit figure.

Investigate each to a conclusion, holding to the same standard as the rest of this skill: read the markup, confirm the behavior is real and repeatable, and rule out the observation artifacts in Testing Notes before believing it. A thread ending in "nothing wrong here" is a genuine result and must be recorded — negatives are what make coverage visible.

**Record every thread in `explorationPass`**, whatever the outcome:

| Outcome | Use when |
|---|---|
| `no-issue` | Investigated and working correctly |
| `finding-raised` | It became an entry in `issues` — name which one |
| `inconclusive` | Can't be settled without access you don't have; say what would settle it |
| `out-of-scope` | A real problem, but not commerce-flow. Set `referredTo` to the command that covers it (`/kosh:a11y`, `/kosh:performance`, `/kosh:functional-design`) |

That last row is the one that earns its keep: it's how a real observation survives the run instead of being mentioned once and lost.

Do not pad this. If a store is genuinely clean, three honest `no-issue` threads are worth more than five invented ones.

---

## SECTION 5: Data Collection & Report Generation

### ⚠️ BEFORE STARTING THIS SECTION

**STOP. Have you completed the MANDATORY TESTING CHECKLIST above?**

- ✅ Did you test 2 different products?
- ✅ Did you add both to the cart and verify each add?
- ✅ Did you update a quantity AND remove an item, verifying the math?
- ✅ Did you reach checkout and stop at the payment step without placing an order?
- ✅ Did you spot-check all three mobile surfaces?
- ✅ Did you fill out and complete the MANDATORY TESTING CHECKLIST?

**If you answered NO to any of these, STOP. Return to the relevant phase and complete it before proceeding.**

**If you answered YES to all of these, proceed to data collection below.**

---

### 5.1 Findings Format

Each finding goes into the `issues` object under its severity:

```json
{
  "category": "Cart",
  "issue": "What is specifically wrong, naming the element or behavior",
  "impact": "What the shopper experiences and what it costs the store",
  "device": "mobile|desktop|both",
  "pages": ["https://example.com/cart/"],
  "screenshots": ["screenshots/example-finding.png"]
}
```

**`screenshots` field (optional but strongly encouraged):**
When a finding is visual — a broken cart layout, an unreadable mobile checkout, a missing button, a mis-rendered total — attach the relevant screenshot(s) so the HTML report can embed them inline next to the finding. The path is relative to the `reports/` directory (e.g. `screenshots/cart-mobile.png` for a file saved at `reports/screenshots/cart-mobile.png`). Multiple screenshots per finding are fine (desktop + mobile of the same issue, or before/after a cart operation). Skip the field where a screenshot adds nothing.

**Issue categories for this test:**
- **Catalog** (product grid, archive pages, card contents, sorting/pagination)
- **Product** (product page, variations, add-to-cart control, price display)
- **Cart** (cart contents, quantity and removal operations, totals math, empty state)
- **Checkout** (form fields, inline validation, order review, shipping and payment display)
- **Store** (cross-cutting: store discovery, navigation between surfaces, price inconsistency across surfaces, blocking overlays)

**Priority assignment:**
- **Critical**: Blocks the purchase path, or the shopper is charged more than the price they were shown — add-to-cart fails, cart math is wrong, the amount charged exceeds the advertised price, checkout is unreachable for guests, no payment method available, gateway in test mode on production
- **High**: Significantly impairs the purchase path — any price the shopper sees that doesn't match what they're charged, broken mobile cart, a validation error a shopper can't resolve
- **Medium**: Noticeable issue with a workaround — awkward quantity control, unclear notice placement
- **Low**: Minor concern or improvement — dead-end empty cart, small tap targets that still work

**MANDATORY SEVERITY FLOOR — money must always agree.**

Any mismatch between a price the shopper is shown and the amount they are actually charged is **at minimum `high`**, and **`critical` when the charge is the larger of the two**. This floor is not a judgment call and it is not negotiable:

- ✅ **The size of the discrepancy is irrelevant to the severity.** A one-cent mismatch and a hundred-dollar mismatch are rated the same. Do not reason "it's only $1", "it's just rounding", or "the amount is small" — a rounding rule that produces a wrong number is a pricing bug the shop is unaware of, and the same rule may be producing much larger errors on products, plans, or currencies this test never touched. You sampled two products; you cannot conclude the discrepancy is small in general.
- ✅ **A displayed unit price that doesn't multiply out counts.** "$93 / box" alongside "6 Boxes" is a claim that the total is $558. If the cart says $559, the store is advertising a price it does not honour. Rate it on the mismatch, not on the difference.
- ✅ **This applies across every surface pair** — catalog to product page, product page to cart, cart to checkout, and mini-cart to cart.
- ✅ **The only legitimate difference is a labeled one.** Tax, shipping, or a discount that is named and shown as a separate line is correct behavior, not a discrepancy. An unexplained change is a finding.

Why the floor exists: shoppers who spot a total that doesn't match the advertised price abandon the purchase, and the ones who don't spot it may have grounds for a complaint about deceptive pricing. Either way the store loses. Pricing accuracy is the one thing a shop cannot get slightly wrong.

Remember: commerce-flow findings only. Console and network errors belong inside the relevant finding's `issue` text as supporting evidence, never as standalone findings.

---

### 5.2 Populate qa-report-shop.json

Structure your data into `reports/data/qa-report-shop.json`:

```json
{
  "url": "https://example.com",
  "websiteName": "Example",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "environment": "production",
  "testMethodology": "Guest shopping journey via Playwright MCP: catalog browse, two products added to cart, quantity update and item removal verified against cart totals, checkout form completed with test data and stopped at the payment step. No order was placed.",
  "visitedPages": [
    "https://example.com/",
    "https://example.com/shop/",
    "https://example.com/product/example-product-one/",
    "https://example.com/product/example-product-two/",
    "https://example.com/cart/",
    "https://example.com/checkout/"
  ],
  "shop": {
    "platform": "woocommerce",
    "shopUrl": "https://example.com/shop/",
    "cartUrl": "https://example.com/cart/",
    "checkoutUrl": "https://example.com/checkout/",
    "implementation": { "cart": "classic", "checkout": "classic" },
    "productsTested": [
      {
        "url": "https://example.com/product/example-product-one/",
        "name": "Example Product One",
        "type": "simple",
        "price": "$24.00"
      },
      {
        "url": "https://example.com/product/example-product-two/",
        "name": "Example Product Two",
        "type": "variable",
        "price": "$32.00"
      }
    ],
    "cartOperations": {
      "quantityUpdated": true,
      "itemRemoved": true,
      "totalsVerified": true
    },
    "checkoutStop": "Stopped at the payment step: card iframe present, Place Order not clicked."
  },
  "explorationPass": [
    {
      "check": "Whether the struck-through was-price on the product page reconciles with the discount applied in the cart",
      "area": "Product",
      "outcome": "no-issue",
      "detail": "Was-price £40.00 and current £32.00 on the product page; cart line showed the same £32.00 with a 20% saving labelled. Arithmetic agrees."
    },
    {
      "check": "Whether the theme's custom quantity stepper writes a value the cart actually honours",
      "area": "Cart",
      "outcome": "finding-raised",
      "detail": "Stepper display and server state diverged after rapid clicks. Raised as the medium Cart finding on quantity persistence."
    },
    {
      "check": "Whether the purchase-option radio group is announced correctly to assistive technology",
      "area": "Product",
      "outcome": "out-of-scope",
      "detail": "The group carries role=radiogroup but its buttons expose no aria-checked, so selection state is conveyed only by an is-active class. Real issue, but accessibility rather than commerce flow.",
      "referredTo": "/kosh:a11y"
    }
  ],
  "issues": {
    "critical": [],
    "high": [],
    "medium": [],
    "low": []
  }
}
```

Use the real values you observed. `timestamp` must be an actual ISO 8601 timestamp, not a placeholder. The `shop` block is the record of what was actually exercised — fill it honestly, including `false` values in `cartOperations` if an operation couldn't be completed (which should have a matching finding).

`explorationPass` holds the exploration pass, one entry per thread — including the ones that found nothing. Its value is precisely that it records work that produced no finding, so a reader can tell the difference between "this store is clean here" and "nobody looked". Keep `issues` for defects and `explorationPass` for what was examined; a thread that became a finding appears in both.

The structure is defined in `schemas/qa-report-shop-schema.json`.

### 5.3 Generate the HTML Report

```bash
scripts/run-qa-report.sh reports/data/qa-report-shop.json
```

The script auto-detects the shop type from the filename and applies `--shop`, producing `reports/<SITE>_SHOP_QA_REPORT_<date>.html`.

**Shop reports are standalone.** Do not pass them to the merge scripts — merging covers the functional, performance, and accessibility types only.

---

## Important Testing Notes

**The pitfalls that produce false findings.** Rule them out before reporting:

- **The blockUI overlay.** WooCommerce blanks the region it's updating with `.blockUI.blockOverlay`. Clicking through it does nothing, which looks exactly like a broken button. Always wait for it to clear after an AJAX cart action.
- **Cookie banners and modals.** Dismissed in §1.1 for a reason — if one reappears mid-journey (some fire on scroll or exit-intent), dismiss it again before concluding a control doesn't work.
- **select2 country dropdowns.** The visible widget is JS-rendered and awkward to drive. Use `browser_select_option` on the underlying `<select>`; WooCommerce listens for the `change` event and updates shipping accordingly.
- **Redirect-to-cart after adding.** A store setting, not a bug. If clicking add-to-cart lands you on the cart page, the add worked.
- **Auto-updating vs. manual cart updates.** Classic themes differ on whether the "Update cart" button is needed, disabled until dirty, or bypassed by an auto-submit. Observe what this store does rather than assuming.
- **Theme-overridden templates.** Selectors here are verification signals; snapshot refs are click targets. A missing class name is not itself a finding.
- **Mixed notice families.** A classic cart can render blocks-style notices and vice versa. Sweep both families (Phase B) before reporting a missing confirmation, success message, or undo.
- **The cache boundary.** Adding to the cart sets cookies that bypass most page caches, so the store you see after the first add can genuinely differ from the one you saw before it — prices, currency, and personalised blocks all change. Treat pre-add and post-add observations as separate states rather than assuming one contradicts the other in error, and run the Phase B re-check rather than trusting either alone.
- **Hidden elements that look like problems.** An empty mini-cart renders a real `$0.00` in the header, and analytics beacons are 1×1 images that count as "broken". Check whether an element is visible and where it sits before treating its contents as a product price or a broken asset.
- **Transient zero measurements.** `getBoundingClientRect()` can return `0×0` for an element that is mid-layout or in a collapsed ancestor, which reads as "the control isn't rendered". Confirm against `getComputedStyle` before reporting a control as missing or a tap target as unusably small.
- **Cross-origin payment iframes.** Invisible to `browser_snapshot`, and off-limits anyway. Their presence is the stop point.
- **Tax and shipping appearing at checkout.** Expected behavior, not a price inconsistency — as long as the change is labeled.

---

## FINAL REMINDER

Before you generate the report, confirm:

1. **Did I avoid placing an order and entering any payment details?** (If not, stop and tell the user immediately — this is the one rule that matters most.)
2. **Did I test 2 different products and verify both adds?**
3. **Did I complete both cart operations and verify the math numerically?**
4. **Did I reach checkout as a guest and stop at the payment step?**
5. **Did I spot-check all three mobile surfaces and complete the MANDATORY TESTING CHECKLIST?**

A shop test that stops at the product page is not a shop test. The value of this skill is in the steps most testing never reaches — the cart math and the checkout form — because that's where stores quietly lose sales.
