/** Activation order for TypeScript plugins. A plugin loads after every dependency it names. */

export interface PluginNode {
  id: string;
  dependencies?: readonly string[];
  enabled: boolean;
}

export function pluginActivationOrder(plugins: readonly PluginNode[]) {
  const enabled = plugins.filter((plugin) => plugin.enabled);
  const known = new Set(plugins.map((plugin) => plugin.id));
  const enabledIds = new Set(enabled.map((plugin) => plugin.id));
  const errors: string[] = [];
  const deps = new Map<string, string[]>();
  for (const plugin of enabled) {
    const dependencies = [...new Set(plugin.dependencies ?? [])].filter((id) => id && id !== plugin.id);
    for (const dependency of dependencies) {
      if (!known.has(dependency)) errors.push(`${plugin.id} requires ${dependency}, which is not installed`);
      else if (!enabledIds.has(dependency)) errors.push(`${plugin.id} requires ${dependency} to be active`);
    }
    deps.set(plugin.id, dependencies.filter((id) => enabledIds.has(id)));
  }
  const incoming = new Map<string, number>();
  for (const plugin of enabled) incoming.set(plugin.id, 0);
  for (const [id, dependencies] of deps) {
    incoming.set(id, dependencies.length);
  }
  const ready = enabled.map((plugin) => plugin.id).filter((id) => (incoming.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const [other, dependencies] of deps) {
      if (!dependencies.includes(id)) continue;
      incoming.set(other, (incoming.get(other) ?? 1) - 1);
      if (incoming.get(other) === 0) ready.push(other);
    }
  }
  if (order.length !== enabled.length) {
    const stuck = enabled.map((plugin) => plugin.id).filter((id) => !order.includes(id));
    errors.push(`Plugin dependency cycle: ${stuck.join(', ')}`);
  }
  const blocked = new Set<string>();
  for (const error of errors) {
    if (error.startsWith('Plugin dependency cycle:')) {
      for (const id of error.slice('Plugin dependency cycle:'.length).split(',')) {
        const name = id.trim();
        if (name) blocked.add(name);
      }
    } else {
      blocked.add(error.split(' ')[0]);
    }
  }
  return { order: order.filter((id) => !blocked.has(id)), errors };
}
