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
