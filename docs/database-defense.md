# Database access for the defense

The app encrypts the SMTP password, Resend key, Gemini key, and OpenAI key in `system_settings` using AES-256-GCM. Each write gets a random IV; authentication binds the value to its field. Only server settings code decrypts credentials. Browser responses retain the existing saved-key flags.

`DATA_ENCRYPTION_KEY` must be 32–64 cryptographically random bytes encoded as hex (64–128 characters). It is a dedicated key, separate from Better Auth and Gateway passwords. Keep it stable and back it up separately from database backups. Losing or changing it makes saved credentials unreadable. New deployments must pass it to the **app container only**.

Generate a new key when first configuring a deployment:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not regenerate the key on startup. Never commit it, place it in the database, or pass it to Gateway. Encryption covers service credentials; authentication sessions and student records remain sensitive and are not encrypted by this feature.

## Upgrade and rollback

Back up the database securely. Stop old app instances before upgrading: older versions cannot use encrypted values. Start the new app with the dedicated key. Startup upgrades existing nonempty plaintext credentials in one transaction and verifies previously encrypted values. Null and deliberately cleared values retain their meaning. Repeated startup does not re-encrypt values. Missing, invalid, or incorrect keys stop startup rather than treating ciphertext as an API key.

For a manual migration in a stopped deployment:

```sh
npm run db:secrets -- encrypt
```

Docker includes the same command:

```sh
docker compose run --rm --entrypoint node app --import tsx scripts/settings-secrets.ts encrypt
```

For rollback, stop every app instance, keep the original key, and run `npm run db:secrets -- decrypt` (or substitute `decrypt` in the Docker command). This explicitly restores plaintext credentials, so restrict database access before downgrading. Then deploy the old version. Do not run old and new versions concurrently. The migration changes credential values, not the schema.

Encryption does not erase historical SQLite pages, WAL files, or old plaintext backups. Keep those private. Use the synthetic database below for the public viewer.

## Create the panelists' database

```sh
npm run db:defense
```

This creates `defense/defense.db` from the repository's current migrations and synthetic sample users, a program, curriculum, subject, enrollment and grade. It never reads `.env` or the live database. It includes the same schema but no live data, credentials, passwords, sessions, verification tokens, uploaded files, or storage configuration. Demo emails use `example.invalid`; demo users have no login accounts. Existing output is never overwritten. To regenerate, choose another destination explicitly:

```sh
npm run db:defense -- defense/another-demo.db
```

Only put synthetic demonstration files in `defense/`. Gateway can access that entire directory.

## Run the isolated Gateway

Set a separate strong `DRIZZLE_GATEWAY_MASTERPASS` in `.env`, then:

```sh
docker compose -f docker-compose.defense.yml up -d
```

Open `http://localhost:4983`, sign in with the master password, and add a SQLite connection to `/databases/defense.db`. Configure a separate limited user password for panelists; keep the master password private. The container mounts only the synthetic database directory read-only. Its writable configuration volume is separate. It receives no app encryption key, Better Auth secret, Garage credentials, or live database mount.

The supplied compose file binds to loopback only. For internet access, place an authenticated HTTPS reverse proxy or access-controlled tunnel in front of that loopback service. Verify login and the limited user account before sharing the URL. TLS certificates, domain/access-provider setup, and public deployment are operator steps; no public service is created by these repository changes. Do not publish the live database or the app's `.env` file through the viewer.

The database mount enforces read-only access independently of UI controls. Verify that a SELECT works and an UPDATE fails through the Gateway connection before the defense. Docker integration is separate from the app tests.

Official Gateway deployment references: [Docker configuration](https://github.com/drizzle-team/gateway-website/blob/main/src/content/docs/docker.mdx), [master and limited user access](https://github.com/drizzle-team/gateway-website/blob/main/src/content/docs/railway.mdx).
