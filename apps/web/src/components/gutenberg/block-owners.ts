const owners = new Map<string, string>();

export function rememberBlockOwner(name: string, pluginId: string) {
  owners.set(name, pluginId);
}

export function blockOwner(name: string) {
  return owners.get(name) || name.split('/')[0] || name;
}
