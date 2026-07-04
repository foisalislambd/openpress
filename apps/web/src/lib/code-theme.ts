import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import type { ThemeDefinition } from '@openpress/shared';

// Loader for uploaded full-code React themes ("react-v1" engine).
// The API bundles the theme's JSX source into a single CommonJS file;
// here we evaluate it server-side, providing React from the host app.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const cache = new Map<string, ThemeDefinition>();

function requireShim(name: string) {
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return JsxRuntime;
  throw new Error(
    `Theme tried to require "${name}". Only "react" is available to themes.`,
  );
}

export async function loadCodeTheme(
  id: string,
  version: string,
  updatedAt: number,
): Promise<ThemeDefinition | null> {
  const cacheKey = `${id}@${version}:${updatedAt}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${API_URL}/api/themes/installed/${id}/bundle.js`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) return null;
    const source = await res.text();

    const module = { exports: {} as Record<string, unknown> };
    const evaluate = new Function(
      'module',
      'exports',
      'require',
      `${source}\n//# sourceURL=openpress-theme-${id}.js`,
    );
    evaluate(module, module.exports, requireShim);

    const exported =
      (module.exports.default as Partial<ThemeDefinition>) ??
      (module.exports as Partial<ThemeDefinition>);

    if (
      !exported?.Layout ||
      !exported.Home ||
      !exported.Post ||
      !exported.Page ||
      !exported.Archive
    ) {
      console.error(
        `Theme "${id}" must export Layout, Home, Post, Page and Archive components`,
      );
      return null;
    }

    const theme: ThemeDefinition = {
      manifest: {
        id,
        name: exported.manifest?.name ?? id,
        description: exported.manifest?.description ?? '',
        author: exported.manifest?.author ?? '',
        version,
      },
      Layout: exported.Layout,
      Home: exported.Home,
      Post: exported.Post,
      Page: exported.Page,
      Archive: exported.Archive,
    };
    cache.set(cacheKey, theme);
    return theme;
  } catch (err) {
    console.error(`Failed to load code theme "${id}":`, err);
    return null;
  }
}
