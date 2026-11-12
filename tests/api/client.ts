import "dotenv/config";

export const BASE = process.env.API_BASE_URL || "http://localhost:3000";

export interface Resp<T = any> { status: number; body: { success: boolean; data?: T; error?: { code: string; message: string; details?: any }; message?: string }; headers: Headers }

/** Tiny HTTP client with its own cookie jar — one instance == one browser session. */
export class Client {
  private cookie = "";
  async call<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Resp<T>> {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(";");
      if (/^[^=]+=;?$/.test(pair) || /Max-Age=0/i.test(c)) this.cookie = "";
      else this.cookie = pair;
    }
    return { status: res.status, body: await res.json().catch(() => ({ success: false })), headers: res.headers };
  }
  get = <T = any>(p: string) => this.call<T>("GET", p);
  post = <T = any>(p: string, b?: unknown, h?: Record<string, string>) => this.call<T>("POST", p, b ?? {}, h);
  put = <T = any>(p: string, b?: unknown) => this.call<T>("PUT", p, b ?? {});
  patch = <T = any>(p: string, b?: unknown) => this.call<T>("PATCH", p, b ?? {});
  del = <T = any>(p: string) => this.call<T>("DELETE", p);
  hasSession() { return this.cookie.length > 0; }
}

export const PASSWORD = "TestPass123";
export const stamp = Date.now().toString(36);
let i = 0;
export const email = (tag: string) => `${tag}.${stamp}.${i++}@apitest.local`;

export async function registerUser(tag: string): Promise<{ client: Client; userId: number; email: string; name: string }> {
  const client = new Client();
  const e = email(tag);
  const r = await client.post("/api/auth/register", { name: `Test ${tag}`, email: e, password: PASSWORD });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  return { client, userId: r.body.data.user.userId, email: e, name: `Test ${tag}` };
}
