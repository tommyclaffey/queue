// One place that turns .env into ready-to-use objects, for both the CLI and the web app.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { InstagramClient } from './instagram.js';
import { FileShare } from './fileshare.js';
import { TokenStore } from './token.js';
import { Queue } from './queue.js';

export function loadConfig(root) {
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
  const env = process.env;
  const login = (env.IG_LOGIN || 'instagram').toLowerCase();
  if (!['instagram', 'facebook'].includes(login)) throw new Error(`IG_LOGIN must be "instagram" or "facebook", got "${env.IG_LOGIN}"`);

  const tokens = new TokenStore(join(root, 'data', 'token.json'), env.IG_ACCESS_TOKEN?.trim());
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
    queue: new Queue(join(root, 'data', 'queue.json')),
    files: new FileShare({ publicBaseUrl: env.PUBLIC_BASE_URL || null, port: Number(env.SHARE_PORT || 0), log }),
    stageWindowMin: Number(env.STAGE_WINDOW_MIN || 120),
    port: Number(env.PORT || 4400),
  };
}
