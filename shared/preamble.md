Parse $ARGUMENTS into a URL and an optional environment type before doing anything else:

1. Extract the URL from $ARGUMENTS (the token that starts with `http://` or `https://`). If no URL is found, ask the user to provide one before proceeding. Do not begin testing without a valid URL.
2. Extract the environment type if present — one of `local`, `development`, `staging`, or `production`. If not provided, infer it from the URL when possible (e.g., `.test`/`.local` domains suggest local, `staging.*` subdomains suggest staging). Default to `production` if unclear.

kosh's own files are in the folder two levels above this skill's folder: the one that holds `skills/`. Below, `<kosh>` stands for that folder's absolute path. Run every command from the folder you started in, since that's where `reports/` goes.
