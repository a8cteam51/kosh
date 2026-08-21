Parse $ARGUMENTS into a URL and an optional environment type before doing anything else:

1. Extract the URL from $ARGUMENTS (the token that starts with `http://` or `https://`). If no URL is found, ask the user to provide one before proceeding. Do not begin testing without a valid URL.
2. Extract the environment type if present — one of `local`, `development`, `staging`, or `production`. If not provided, infer it from the URL when possible (e.g., `.test`/`.local` domains suggest local, `staging.*` subdomains suggest staging). Default to `production` if unclear.

Navigate to the extracted URL and conduct a guest shopping-journey QA test of the site's store — catalog through checkout, never submitting an order — using the determined environment type to guide how findings are reported.

Follow the testing instructions in skills/shop/SKILL.md.
