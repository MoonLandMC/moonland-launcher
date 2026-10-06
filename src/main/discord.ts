import { Client } from '@xhayper/discord-rpc';
import { DISCORD_APP_ID, DISCORD_INVITE, SITE } from './config';

export type PresenceState = 'off' | 'launcher' | 'playing';

export function activityFor(state: PresenceState, startedAt?: number) {
  if (state === 'off') return null;
  return {
    details: state === 'playing' ? 'Играет на MoonLand' : 'В лаунчере MoonLand',
    largeImageKey: 'logo',
    largeImageText: 'MoonLand',
    startTimestamp: state === 'playing' ? startedAt : undefined,
    buttons: [
      { label: 'Сайт сервера', url: SITE },
      { label: 'Наш Discord', url: DISCORD_INVITE },
    ],
  };
}

/** Активность в Discord. Если Discord не запущен, молча ничего не делает. */
export class Presence {
  private client: Client | null = null;
  private ready = false;
  private pending: { state: PresenceState; startedAt?: number } | null = null;

  async start(): Promise<void> {
    if (this.client) return;
    try {
      const c = new Client({ clientId: DISCORD_APP_ID });
      this.client = c;
      c.on('ready', () => {
        this.ready = true;
        if (this.pending) this.set(this.pending.state, this.pending.startedAt);
      });
      await c.login();
    } catch { this.client = null; this.ready = false; }
  }

  set(state: PresenceState, startedAt?: number): void {
    this.pending = { state, startedAt };
    const user = this.ready ? this.client?.user : undefined;
    if (!user) return;
    const a = activityFor(state, startedAt);
    (a ? user.setActivity(a) : user.clearActivity()).catch(() => {});
  }

  async stop(): Promise<void> {
    try { await this.client?.destroy(); } catch {}
    this.client = null; this.ready = false;
  }
}
