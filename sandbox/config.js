// SANDBOX configuration. Same Supabase project and member list as the live site,
// but every saved item is stored under the "sandbox/" prefix, so live samples are never touched.
window.DW_CONFIG = {
  supabaseUrl: "https://degnckdliboxknyjswyw.supabase.co",
  supabaseKey: "sb_publishable_a-o3MZTaB8Y9GLq6AbN_aA__1_S1ZSK",
  dataPrefix: "sandbox/",
  sandbox: true,
  // Everyone signs in with this shared lab account and the lab password (set in Supabase, Authentication > Users).
  labEmail: "senzymes@leibniz-inm.de",
  // "Publish sandbox data to live" asks for a PIN and compares it with this fingerprint. It guards against
  // accidental clicks; it is not a secret, because this file is public.
  publishPinHash: "3bbf9e80c8ef7b145ecc1873f9f05904453fe68e175f7cb8c397af5788f9865a",
  publishCodeUrl: "https://github.com/anunezleyva24-prog/data-workbench/actions/workflows/publish-sandbox.yml",
};
