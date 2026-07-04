# API Reference

Base URL: `http://localhost:4000/api`

## Authentication

JWT Bearer tokens. Obtain via login or refresh.

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@openpress.local", "password": "admin12345" }
```

Response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "email": "...", "role": "ADMIN" }
}
```

Use header: `Authorization: Bearer <accessToken>`

Access token expires in **15 minutes**. Refresh:

```http
POST /api/auth/refresh
{ "refreshToken": "..." }
```

### Auth endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public* | Create account |
| POST | `/auth/login` | Public | Login |
| POST | `/auth/refresh` | Public | New tokens |
| GET | `/auth/me` | JWT | Current user |

\*Registration disabled after first user unless `allowRegistration` is true in settings.

## Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | Site settings (public keys only) |
| GET | `/content/public` | Published posts/pages (`?type=POST&page=1`) |
| GET | `/content/public/slug/:slug` | Single item by slug |
| GET | `/content/public/id/:id` | Single item by id |
| GET | `/comments/content/:contentId` | Approved comments |
| POST | `/comments` | Submit comment (guest or user) |
| GET | `/taxonomy/categories` | All categories |
| GET | `/taxonomy/tags` | All tags |
| GET | `/themes/installed` | Uploaded theme list |
| GET | `/themes/installed/:id` | Theme manifest |
| GET | `/themes/installed/:id/style.css` | Theme CSS |
| GET | `/themes/installed/:id/bundle.js` | Theme JS bundle (`react-v1`) |

## Content (JWT)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/content` | List (`?type=POST&status=DRAFT&search=`) |
| GET | `/content/:id` | Single |
| GET | `/content/:id/revisions` | Revision history |
| POST | `/content` | Create |
| PATCH | `/content/:id` | Update |
| DELETE | `/content/:id` | Delete |

### Create/update body (example)

```json
{
  "title": "My Post",
  "slug": "my-post",
  "type": "POST",
  "status": "PUBLISHED",
  "excerpt": "Short summary",
  "blocks": [],
  "seo": { "title": "SEO title", "description": "Meta description" },
  "coverImage": "/uploads/...",
  "categoryIds": ["..."],
  "tagIds": ["..."]
}
```

## Media (JWT)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/media` | List |
| POST | `/media/upload` | Multipart `file`, optional `alt` |
| PATCH | `/media/:id` | Update `alt` |
| DELETE | `/media/:id` | Delete file + record |

Allowed MIME types: JPEG, PNG, GIF, WebP, SVG, AVIF, MP4, WebM, MPEG, PDF.

## Taxonomy (JWT for write)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/taxonomy/categories` | List |
| POST | `/taxonomy/categories` | Create |
| PATCH | `/taxonomy/categories/:id` | Update |
| DELETE | `/taxonomy/categories/:id` | Delete |
| GET | `/taxonomy/tags` | List |
| POST | `/taxonomy/tags` | Create |
| DELETE | `/taxonomy/tags/:id` | Delete |

## Comments (JWT for moderation)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/comments` | Editor+ | List (`?status=PENDING`) |
| PATCH | `/comments/:id/status` | Editor+ | `{ "status": "APPROVED" }` |
| DELETE | `/comments/:id` | Editor+ | Delete |

## Users (Admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List |
| POST | `/users` | Create |
| PATCH | `/users/:id` | Update role/password |
| DELETE | `/users/:id` | Delete |

## Settings (Admin for write)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | All public settings |
| PUT | `/settings` | Update allowed keys only |

Allowed keys: `siteTitle`, `siteDescription`, `activeTheme`, `homepageType`, `homepageId`, `postsPerPage`, `allowRegistration`.

## Themes (Admin for upload/delete)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/themes/upload` | Multipart zip |
| DELETE | `/themes/installed/:id` | Remove uploaded theme |

## Plugins (Admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/plugins` | Installed plugins |
| POST | `/plugins/upload` | Multipart zip |
| PATCH | `/plugins/:id/toggle` | Enable/disable |
| DELETE | `/plugins/:id` | Remove |

## Rate limits

- Global: **120 requests/minute** per IP
- Login/register: **10/minute**
- Guest comments: **15/minute**

## Errors

Standard NestJS format:

```json
{
  "statusCode": 400,
  "message": "Human-readable message",
  "error": "Bad Request"
}
```

Validation errors may return `message` as an array of strings.

## Static files

Uploaded media: `http://localhost:4000/uploads/<filename>`

Next.js rewrites `/uploads/*` to the API in development.
