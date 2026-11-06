import { Injectable } from '@nestjs/common';
import { OptionDefinition, OptionType } from '../settings/option-defs';
import { RewriteRule } from '../rewrite/rewrite-rules';

export interface RegisteredCapability {
  name: string;
  label: string;
  source: string;
}

/**
 * In-memory registrations from themes and plugins.
 * Unloading a plugin removes only that source. Durable data stays in Postgres.
 */
@Injectable()
export class CoreRegistry {
  private options: OptionDefinition[] = [];
  private capabilities: RegisteredCapability[] = [];
  private rewrites: RewriteRule[] = [];

  clear(source: string) {
    this.options = this.options.filter((item) => item.source !== source);
    this.capabilities = this.capabilities.filter((item) => item.source !== source);
    this.rewrites = this.rewrites.filter((item) => item.source !== source);
  }

  addOption(option: OptionDefinition) {
    if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,80}$/.test(option.key)) {
      throw new Error('Invalid option key');
    }
    this.options = this.options.filter((item) => item.key !== option.key);
    this.options.push(option);
  }

  addCapability(cap: RegisteredCapability) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(cap.name)) throw new Error('Invalid capability name');
    this.capabilities = this.capabilities.filter((item) => item.name !== cap.name);
    this.capabilities.push(cap);
  }

  addRewrite(rule: RewriteRule) {
    this.rewrites = this.rewrites.filter((item) => item.id !== rule.id);
    this.rewrites.push(rule);
  }

  optionsFor(source?: string) {
    return source ? this.options.filter((item) => item.source === source) : [...this.options];
  }

  capabilitiesFor() {
    return [...this.capabilities];
  }

  rewritesFor() {
    return [...this.rewrites];
  }
}

export function optionType(value: string): OptionType {
  if (value === 'number' || value === 'boolean' || value === 'json') return value;
  return 'string';
}
