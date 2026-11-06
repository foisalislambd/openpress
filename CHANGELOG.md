# Changelog

All notable changes to OpenPress are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Core power systems: custom roles and per-user capabilities, a typed settings registry, a structured content query, Postgres cron, nav menus, widget instances, rewrite rules, and server-side block validation
- Core depth: meta and tax query groups, term and comment meta, transients, comment and widget HTML allow-list, post edit locks, and a multisite foundation (sites table, site options, per-site content)

### Changed

- Replaced Prisma with the `pg` driver and SQL migrations

### Added

- Revision compare and restore in the post and page editor
- Community open-source files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub issue/PR templates

## [0.1.0] - 2026-07-10

### Added

- Initial public release of OpenPress
- NestJS REST API with Prisma + PostgreSQL
- Next.js public site and `/admin` panel
- Posts, pages, media, comments, categories, tags
- JWT auth with Admin / Editor / Author roles
- Theme system (`runtime-v1`, `react-v1`) and plugin hooks
- Default theme, docs, Docker Compose, and embedded Postgres helper
