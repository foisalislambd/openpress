# Roles & Permissions

Five roles, WordPress-style. Enforcement is the capability map in `apps/api/src/auth/capabilities.ts`, not the menu alone.

## Role matrix

| Action | Admin | Editor | Author | Contributor | Subscriber |
|--------|:-----:|:------:|:------:|:-----------:|:----------:|
| View admin panel | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/edit own posts | ✓ | ✓ | ✓ | ✓ | — |
| Publish posts | ✓ | ✓ | ✓ | — | — |
| Create/edit any post | ✓ | ✓ | — | — | — |
| Create/edit pages | ✓ | ✓ | — | — | — |
| Delete own posts | ✓ | ✓ | ✓ | ✓ | — |
| Delete any post | ✓ | ✓ | — | — | — |
| Media library | ✓ | ✓ | ✓ | — | — |
| Categories & tags | ✓ | ✓ | ✓ | — | — |
| Moderate comments | ✓ | ✓ | — | — | — |
| Manage users | ✓ | — | — | — | — |
| Site settings | ✓ | — | — | — | — |
| Themes and plugins | ✓ | — | — | — | — |

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

## Site roles and network administrators

Users belong to the network. Each site stores that user's role in `site_users`. Capability checks use the role on the site selected by `X-OpenPress-Site` or the request host. A grant or deny is stored for that site only.

`networkAdmin` is separate. It adds `manage_network`, `manage_sites`, `manage_network_users`, and `manage_network_options`. A site administrator does not receive those. Existing administrators were marked network administrators by migration `007_network_roles.sql`.

## Custom roles

Administrators can add roles under **Users → Roles**. A role is a slug plus a list of capabilities. A user can also receive extra grants or denies (`PUT /api/users/:id/access`). A deny removes a capability the role would otherwise have. Denies do not apply to the built-in Administrator role, and only an Administrator can assign that role.

Write routes check the capability (`manage_options`, `edit_users`, `moderate_comments`, and the rest) against the database row, so a change applies on the next request.

## API enforcement

Mutating routes require the matching capability. Hiding a menu is not the check. The API rejects the call when the capability is missing.
