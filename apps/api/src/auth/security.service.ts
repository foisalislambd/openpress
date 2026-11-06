import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { AuthService } from './auth.service';
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

@Injectable()
export class SecurityService {
  private readonly keyMaterial: string;

  constructor(
    private db: DbService,
    private jwt: JwtService,
    private auth: AuthService,
    config: ConfigService,
  ) {
    this.keyMaterial = config.get<string>('JWT_SECRET') ?? 'openpress-dev-secret';
  }

  async setupTotp(userId: string, email: string) {
    const secret = generateTotpSecret();
    await this.db.query(
      `INSERT INTO user_totp ("userId", secret, enabled)
       VALUES ($1, $2, false)
       ON CONFLICT ("userId") DO UPDATE SET secret = EXCLUDED.secret, enabled = false`,
      [userId, encryptTotpSecret(secret, this.keyMaterial)],
    );
    return { secret, otpauth: otpauthUrl(secret, email) };
  }

  async confirmTotp(userId: string, code: string) {
    const row = await this.db.one<{ secret: string }>('SELECT secret FROM user_totp WHERE "userId" = $1', [userId]);
    if (!row) throw new BadRequestException('Start authenticator setup first');
    const secret = decryptTotpSecret(row.secret, this.keyMaterial);
    if (!verifyTotp(secret, code)) throw new UnauthorizedException('That code did not match');
    await this.db.query('UPDATE user_totp SET enabled = true WHERE "userId" = $1', [userId]);
    return { enabled: true };
  }

  async disableTotp(userId: string) {
    await this.db.query('DELETE FROM user_totp WHERE "userId" = $1', [userId]);
    return { enabled: false };
  }

  async totpEnabled(userId: string) {
    const row = await this.db.one<{ enabled: boolean }>('SELECT enabled FROM user_totp WHERE "userId" = $1', [userId]);
    return Boolean(row?.enabled);
  }

  async verifyUserCode(userId: string, code: string) {
    const row = await this.db.one<{ secret: string; enabled: boolean }>(
      'SELECT secret, enabled FROM user_totp WHERE "userId" = $1',
      [userId],
    );
    if (!row?.enabled) return false;
    return verifyTotp(decryptTotpSecret(row.secret, this.keyMaterial), code);
  }

  listSessions(userId: string) {
    return this.db.query(
      `SELECT id, "userAgent", ip, "createdAt", "lastSeenAt", "revokedAt"
       FROM user_sessions
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC`,
      [userId],
    );
  }

  async revokeSession(userId: string, id: string) {
    await this.db.query(
      `UPDATE user_sessions SET "revokedAt" = now() WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL`,
      [id, userId],
    );
    return { id };
  }

  async registrationOptions(userId: string, email: string) {
    const existing = await this.db.query<{ credentialId: string; transports: string[] }>(
      'SELECT "credentialId", transports FROM webauthn_credentials WHERE "userId" = $1',
      [userId],
    );
    const options = await generateRegistrationOptions({
      rpName: 'OpenPress',
      rpID: this.rpId(),
      userName: email,
      userID: Buffer.from(userId),
      attestationType: 'none',
      excludeCredentials: existing.map((row) => ({
        id: row.credentialId,
        transports: row.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await this.storeChallenge(options.challenge, 'register', userId);
    return options;
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON) {
    const expectedChallenge = await this.takeChallenge('register', clientDataChallenge(response.response.clientDataJSON));
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin(),
      expectedRPID: this.rpId(),
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Passkey was not verified');
    }
    const credential = verification.registrationInfo.credential;
    await this.db.query(
      `INSERT INTO webauthn_credentials (id, "userId", "credentialId", "publicKey", counter, transports)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        newId(),
        userId,
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        JSON.stringify(credential.transports ?? []),
      ],
    );
    return { verified: true };
  }

  async loginOptions(email?: string) {
    let allow: { id: string; transports?: string[] }[] | undefined;
    let userId: string | undefined;
    if (email) {
      const user = await this.db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
      if (!user) throw new UnauthorizedException('Unknown account');
      userId = user.id;
      allow = await this.db.query('SELECT "credentialId" AS id, transports FROM webauthn_credentials WHERE "userId" = $1', [
        user.id,
      ]);
    }
    const options = await generateAuthenticationOptions({
      rpID: this.rpId(),
      userVerification: 'preferred',
      allowCredentials: allow?.map((row) => ({ id: row.id, transports: row.transports as AuthenticatorTransport[] })),
    });
    await this.storeChallenge(options.challenge, 'login', userId, email);
    return options;
  }

  async verifyLogin(response: AuthenticationResponseJSON, meta?: { userAgent?: string; ip?: string }) {
    const credential = await this.db.one<{
      userId: string;
      credentialId: string;
      publicKey: Buffer;
      counter: number;
      transports: string[];
      email: string;
      role: string;
    }>(
      `SELECT c."userId", c."credentialId", c."publicKey", c.counter, c.transports, u.email, u.role
       FROM webauthn_credentials c
       JOIN users u ON u.id = c."userId"
       WHERE c."credentialId" = $1`,
      [response.id],
    );
    if (!credential) throw new UnauthorizedException('Unknown passkey');
    const expectedChallenge = await this.takeChallenge('login', clientDataChallenge(response.response.clientDataJSON));
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin(),
      expectedRPID: this.rpId(),
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransport[],
      },
    });
    if (!verification.verified) throw new UnauthorizedException('Passkey was not verified');
    await this.db.query('UPDATE webauthn_credentials SET counter = $2 WHERE "credentialId" = $1', [
      credential.credentialId,
      verification.authenticationInfo.newCounter,
    ]);
    return this.auth.issueTokens(credential.userId, credential.email, credential.role, meta);
  }

  providers() {
    return {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    };
  }

  async beginOAuth(provider: 'google' | 'github') {
    if (!this.providers()[provider]) throw new BadRequestException(`${provider} login is not configured`);
    const state = this.jwt.sign({ provider, purpose: 'oauth' }, { expiresIn: '10m' });
    const redirect = `${this.apiBase()}/api/auth/oauth/${provider}/callback`;
    if (provider === 'google') {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
      url.searchParams.set('redirect_uri', redirect);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('state', state);
      return { url: url.toString() };
    }
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  async finishOAuth(provider: 'google' | 'github', code: string, state: string, meta?: { userAgent?: string; ip?: string }) {
    let payload: { provider?: string; purpose?: string };
    try {
      payload = this.jwt.verify(state);
    } catch {
      throw new UnauthorizedException('OAuth state expired');
    }
    if (payload.purpose !== 'oauth' || payload.provider !== provider) {
      throw new UnauthorizedException('OAuth state did not match');
    }
    const profile = provider === 'google' ? await this.googleProfile(code) : await this.githubProfile(code);
    const user = await this.auth.linkExternalUser(provider, profile);
    const exchange = newId();
    await this.db.query(
      `INSERT INTO oauth_codes (id, "userId", "expiresAt") VALUES ($1, $2, now() + interval '2 minutes')`,
      [exchange, user.id],
    );
    const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
    return { redirect: `${web}/admin/login?oauth=${exchange}` };
  }

  async exchangeOAuth(code: string, meta?: { userAgent?: string; ip?: string }) {
    const row = await this.db.one<{ userId: string }>(
      `DELETE FROM oauth_codes WHERE id = $1 AND "expiresAt" > now() RETURNING "userId"`,
      [code],
    );
    if (!row) throw new UnauthorizedException('Login code expired');
    const user = await this.db.one<{ id: string; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE id = $1',
      [row.userId],
    );
    if (!user) throw new UnauthorizedException();
    return this.auth.issueTokens(user.id, user.email, user.role, meta);
  }

  private async googleProfile(code: string) {
    const redirect = `${this.apiBase()}/api/auth/oauth/google/callback`;
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    });
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!token.ok) throw new UnauthorizedException('Google did not return a token');
    const tokenJson = (await token.json()) as { access_token?: string };
    const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profile.ok) throw new UnauthorizedException('Google profile was unreadable');
    const json = (await profile.json()) as { sub?: string; email?: string; name?: string; email_verified?: boolean };
    if (!json.sub || !json.email || json.email_verified !== true) {
      throw new UnauthorizedException('Google account has no verified email');
    }
    return { id: json.sub, email: json.email, name: json.name || json.email };
  }

  private async githubProfile(code: string) {
    const redirect = `${this.apiBase()}/api/auth/oauth/github/callback`;
    const token = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirect,
      }),
    });
    if (!token.ok) throw new UnauthorizedException('GitHub did not return a token');
    const tokenJson = (await token.json()) as { access_token?: string };
    const profile = await fetch('https://api.github.com/user', {
      headers: { authorization: `Bearer ${tokenJson.access_token}`, accept: 'application/vnd.github+json' },
    });
    if (!profile.ok) throw new UnauthorizedException('GitHub profile was unreadable');
    const json = (await profile.json()) as { id?: number; login?: string; name?: string };
    let email: string | undefined;
    const emails = await fetch('https://api.github.com/user/emails', {
      headers: { authorization: `Bearer ${tokenJson.access_token}`, accept: 'application/vnd.github+json' },
    });
    if (emails.ok) {
      const list = (await emails.json()) as { email: string; primary?: boolean; verified?: boolean }[];
      email = list.find((item) => item.primary && item.verified)?.email || list.find((item) => item.verified)?.email;
    }
    if (!json.id || !email) throw new UnauthorizedException('GitHub account has no verified email');
    return { id: String(json.id), email, name: json.name || json.login || email };
  }

  private async storeChallenge(challenge: string, kind: string, userId?: string, email?: string) {
    await this.db.query('DELETE FROM webauthn_challenges WHERE "expiresAt" < now()');
    await this.db.query(
      `INSERT INTO webauthn_challenges (id, "userId", email, kind, challenge, "expiresAt")
       VALUES ($1, $2, $3, $4, $5, now() + interval '5 minutes')`,
      [newId(), userId ?? null, email ?? null, kind, challenge],
    );
  }

  private async takeChallenge(kind: string, challenge: string) {
    if (!challenge) throw new UnauthorizedException('Passkey challenge expired');
    const row = await this.db.one<{ challenge: string }>(
      `DELETE FROM webauthn_challenges
       WHERE kind = $1 AND challenge = $2 AND "expiresAt" > now()
       RETURNING challenge`,
      [kind, challenge],
    );
    if (!row) throw new UnauthorizedException('Passkey challenge expired');
    return row.challenge;
  }

  private rpId() {
    return process.env.WEBAUTHN_RP_ID || 'localhost';
  }

  private origin() {
    return process.env.WEBAUTHN_ORIGIN || process.env.WEB_ORIGIN || 'http://localhost:3000';
  }

  private apiBase() {
    return (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
  }
}

type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';

export function clientDataChallenge(clientDataJSON: string) {
  try {
    const json = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge?: unknown };
    return typeof json.challenge === 'string' ? json.challenge : '';
  } catch {
    return '';
  }
}
