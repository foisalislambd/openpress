/**
 * Capability resolution is data, not a switch on the role name.
 * A deny beats a role cap and a grant. The builtin administrator role
 * ignores denies so the last root account cannot be locked out by a grant row.
 */
export interface CapabilityResolutionInput {
  role: string;
  roleCapabilities: readonly string[];
  /** Code defaults for the builtin administrator. Unioned in so the role cannot be stripped. */
  protectedCapabilities?: readonly string[];
  grants: readonly string[];
  denies: readonly string[];
}

export function resolveCapabilities(input: CapabilityResolutionInput): string[] {
  const caps = new Set<string>();
  for (const cap of input.roleCapabilities) {
    if (cap) caps.add(cap);
  }
  for (const cap of input.protectedCapabilities ?? []) {
    if (cap) caps.add(cap);
  }
  for (const cap of input.grants) {
    if (cap) caps.add(cap);
  }
  const locked = input.role === 'ADMIN';
  if (!locked) {
    for (const cap of input.denies) caps.delete(cap);
  }
  return [...caps].sort();
}

export function hasAll(caps: readonly string[], required: readonly string[]) {
  return required.every((cap) => caps.includes(cap));
}

export function hasAny(caps: readonly string[], required: readonly string[]) {
  return required.some((cap) => caps.includes(cap));
}
