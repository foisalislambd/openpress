# create-openpress

Create a directory that runs OpenPress from the published container images, or scaffold a server plugin.

```bash
npm create openpress@latest my-site
cd my-site
# edit the JWT secrets in docker-compose.yml
docker compose up -d
```

`npm create openpress` runs this package. The Compose file pins `ghcr.io/foisalislambd/openpress-api` and `ghcr.io/foisalislambd/openpress-web` to the same version as the CLI. Prereleases are installed with `npm create openpress@next`.

Scaffold a plugin:

```bash
npx create-openpress plugin hello-note
```

That writes `plugin.json` and `index.js`. Zip the directory and upload it in OpenPress admin. For TypeScript checking, install `@openpress/plugin-sdk`.

The CLI has no dependencies. It does not download the OpenPress source tree.
