# Data Workbench

A browser-based worksheet for importing, analysing and plotting lab data, with export routes into Origin.

Live site: https://anunezleyva24-prog.github.io/data-workbench/

## Shared storage

Samples and their data are stored in a Supabase project (see `config.js`), so every lab member
sees the same samples. Members sign in with an emailed link. Only emails listed in the
`members` table can read or write; to add someone, run in Supabase's SQL Editor:

```sql
insert into public.members (email) values ('new.person@example.com');
```

If `supabaseUrl` in `config.js` is left empty, the app falls back to storing data in each
visitor's own browser.

## Sandbox (try changes before they go live)

- Live site: the files in the repository root. Sandbox: the copy in `sandbox/`, served at
  https://anunezleyva24-prog.github.io/data-workbench/sandbox/
- The sandbox uses the same sign-in and member list, but stores everything under a `sandbox/`
  prefix in the database, so live samples are never changed. "Copy live data here" in the
  sandbox replaces its test data with a copy of the live data (the live data is only read).
- New features are edited in `sandbox/` only, then `tools/stamp-sandbox.sh` is run and pushed.
- After review, `tools/promote.sh` copies the sandbox code to the live site; commit and push.
