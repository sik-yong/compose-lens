/**
 * Replaces the userinfo of every `scheme://user:password@host` URL with `***`.
 * Build contexts and other paths can be Git or HTTP URLs that carry a token
 * (`https://<token>@github.com/…`), and a username alone can be a token too.
 * The greedy authority match keeps an unescaped `@` in a password from leaking.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/?#\s]*@/g, "$1***@");
}
