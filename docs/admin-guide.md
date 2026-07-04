# Admin Guide

Admin panel URL: **http://localhost:3000/admin**

## Dashboard

Overview of post count, page count, and pending comments. Quick link to create a new post.

## Posts

- **List** — filter by status, search by title
- **New post** — BlockNote editor, excerpt, cover image, categories, tags, SEO
- **Save draft** — status `DRAFT`
- **Publish** — status `PUBLISHED`, sets `publishedAt`
- **View** — opens public URL when published

## Pages

Same editor as posts, but `type: PAGE`. Pages appear in the theme navigation (header links).

**Note:** Authors cannot create or edit pages — only Editors and Admins.

## Media

- Upload images, video, PDF (max 25 MB)
- Hover a file to **Copy URL** or **Delete**
- Use copied URLs in post cover image or block content

## Categories & Tags

- **Categories** — hierarchical taxonomy for posts
- **Tags** — flat labels for posts
- Assign both in the post editor sidebar

## Comments

- Guest comments start as **PENDING**
- Logged-in user comments are **APPROVED** automatically
- Actions: Approve, Spam, Delete

## Users (Admin only)

| Role | Access |
|------|--------|
| Admin | Everything |
| Editor | All content, comments; not settings/users/themes |
| Author | Own posts only; no pages |

Create users here or enable public registration in Settings.

## Settings (Admin only)

- **Site title / description** — used in theme header and SEO
- **Homepage** — latest posts or a static page
- **Posts per page** — archive pagination (1–50)
- **Membership** — allow public registration

## Themes (Admin only)

Lists **built-in** themes (from git) and **uploaded** themes (from zip).

1. Click **Upload theme (.zip)**
2. Click **Activate** on the theme you want
3. Uploaded themes can be **Deleted** (built-in themes cannot)

See [Themes guide](themes.md) for how to build a theme zip.

## Plugins (Admin only)

1. Click **Upload plugin (.zip)**
2. Plugin is enabled automatically on upload
3. **Disable** / **Enable** / **Delete** as needed

Plugins run **on the server**. Only install plugins you trust.

See [Plugins guide](plugins.md).

## Log out

Sidebar footer → **Log out**. Tokens are cleared from browser storage.
