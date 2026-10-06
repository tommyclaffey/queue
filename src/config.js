// One place that turns .env into ready-to-use objects, for both the CLI and the web app.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { InstagramClient } from './instagram.js';
import { FileShare } from './fileshare.js';
import { TokenStore } from './token.js';
import { Queue } from './queue.js';
import { makeNotifier } from './notify.js';
import { mergeSettings } from './settings.js';

export function loadConfig(root) {
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
  // Hosted (e.g. Railway): data, media and the saved login live on a persistent volume (DATA_DIR).
  const home = process.env.DATA_DIR || root;
  if (home !== root && existsSync(join(home, '.env'))) process.loadEnvFile(join(home, '.env'));
  const env = process.env;
  const hosted = env.HOSTED === '1';
  const dataDir = join(home, 'data');
  const publicBaseUrl = env.PUBLIC_BASE_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : null);
  const login = (env.IG_LOGIN || 'instagram').toLowerCase();
  if (!['instagram', 'facebook'].includes(login)) throw new Error(`IG_LOGIN must be "instagram" or "facebook", got "${env.IG_LOGIN}"`);

  const settings = mergeSettings(dataDir, env);
  const tokens = new TokenStore(join(dataDir, 'token.json'), env.IG_ACCESS_TOKEN?.trim());
  const log = (m) => console.log(new Date().toLocaleTimeString(), m);

  const ig = new InstagramClient({
    login,
    userId: env.IG_USER_ID?.trim() || undefined,
    token: tokens.token,
    version: env.GRAPH_VERSION || 'v25.0',
    dryRun: env.DRY_RUN === '1',
    uploadMode: env.UPLOAD_MODE || undefined,
  });

  return {
    ig,
    tokens,
    log,
    queue: new Queue(join(dataDir, 'queue.json')),
    files: new FileShare({ publicBaseUrl, port: Number(env.SHARE_PORT || 0), log, embedded: hosted }),
    hosted,
    password: env.QUEUE_PASSWORD || null,
    publicOrigin: publicBaseUrl,
    ownerEmail: env.QUEUE_OWNER_EMAIL || null,
    dataDir,
    mediaDir: join(home, 'media'),
    envFile: join(home, '.env'),
    // App settings (data/settings.json) win over .env, which wins over the defaults.
    stageWindowMin: settings.stageWindowMin,
    lateLimitMin: settings.lateLimitMin,
    notify: makeNotifier({ enabled: process.platform === 'darwin' }),
    notifyOn: settings.notify,
    settings,
    port: Number(env.PORT || 4400),
  };
}
