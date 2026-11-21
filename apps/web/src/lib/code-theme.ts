import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import vm from 'node:vm';
import type { ThemeDefinition } from '@openpress/shared';
import { codeThemesEnabled, themeSourceError } from './code-theme-policy';

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

  if (!codeThemesEnabled()) return null;

  try {
    const res = await fetch(`${API_URL}/api/themes/installed/${id}/bundle.js`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) return null;
    const source = await res.text();
    if (themeSourceError(source)) {
      console.error(`Theme "${id}" was rejected by the code-theme policy`);
      return null;
    }

    const themeModule = { exports: {} as Record<string, unknown> };
    const sandbox = vm.createContext(
      {
        module: themeModule,
        exports: themeModule.exports,
        require: requireShim,
        console: { log() {}, info() {}, warn() {}, error() {} },
      },
      { codeGeneration: { strings: false, wasm: false } },
    );
    vm.runInContext(`"use strict";\n${source}`, sandbox, {
      timeout: 1000,
      filename: `openpress-theme-${id}.js`,
    });

    const exported =
      (themeModule.exports.default as Partial<ThemeDefinition>) ??
      (themeModule.exports as Partial<ThemeDefinition>);

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
