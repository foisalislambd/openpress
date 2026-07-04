# Roles & Permissions

Three roles, WordPress-style.

## Role matrix

| Action | Admin | Editor | Author |
|--------|:-----:|:------:|:------:|
| View admin panel | ✓ | ✓ | ✓ |
| Create/edit own posts | ✓ | ✓ | ✓ |
| Create/edit any post | ✓ | ✓ | — |
| Create/edit pages | ✓ | ✓ | — |
| Delete own content | ✓ | ✓ | ✓ |
| Delete any content | ✓ | ✓ | — |
| Media library | ✓ | ✓ | ✓ |
| Categories & tags | ✓ | ✓ | ✓ |
| Moderate comments | ✓ | ✓ | — |
| Manage users | ✓ | — | — |
| Site settings | ✓ | — | — |
| Themes (upload/activate) | ✓ | — | — |
| Plugins (upload/toggle) | ✓ | — | — |

## Admin

Full control. Required for:

- Changing `activeTheme`, homepage, registration toggle
- Creating/deleting users
- Uploading themes and plugins

**Safeguards:**

- Cannot delete self
- Cannot delete or demote the last Admin
- Cannot delete users who still own content or media

## Editor

Content-focused role. Can manage all posts, pages, comments, and taxonomy. Cannot access Settings, Users, Themes, or Plugins.

## Author

Blog writer role. Can only create and edit **their own posts** (not pages). Useful for multi-author sites without giving structural access.

## Registration

| Scenario | Result |
|----------|--------|
| First user ever registers | Becomes **Admin** |
| Later registrations | **Author**, only if `allowRegistration` is `true` in Settings |
| Admin creates user via Users page | Any role |

## JWT and role changes

Role is embedded in the JWT. If an Admin promotes a user, the user must **log out and log in** (or trigger a token refresh) before Admin-only actions work.

The web client retries once on `403` with a refresh token to pick up role changes automatically.

## Comment behavior

| Submitter | Initial status |
|-----------|----------------|
| Guest | `PENDING` (requires name) |
| Logged-in user | `APPROVED` |

Editors and Admins moderate via **Comments** in admin.

## API enforcement

Roles are enforced server-side via `@Roles('ADMIN')` and similar guards. Never rely on hiding UI alone — the API always validates.
