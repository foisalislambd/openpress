import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

type FilterFn = (value: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
type ActionFn = (...args: unknown[]) => unknown | Promise<unknown>;

interface Filter {
  priority: number;
  fn: FilterFn;
}

interface Action {
  priority: number;
  fn: ActionFn;
}

/**
 * WordPress-style actions and filters.
 * Actions go through the Nest event bus. Filters are an ordered async pipeline
 * and return a value, which EventEmitter cannot do.
 */
@Injectable()
export class HooksService {
  private readonly logger = new Logger('Hooks');
  private readonly filters = new Map<string, Filter[]>();
  private readonly actions = new Map<string, Action[]>();

  constructor(private readonly events: EventEmitter2) {}

  /** WordPress add_action. `on` remains as an alias. */
  addAction(event: string, handler: ActionFn, priority = 10) {
    return this.track(this.actions, event, { priority, fn: handler });
  }

  on(event: string, handler: ActionFn) {
    return this.addAction(event, handler, 10);
  }

  async doAction(event: string, ...args: unknown[]) {
    for (const action of this.actions.get(event) ?? []) {
      try {
        await action.fn(...args);
      } catch (error) {
        this.logger.error(`Action "${event}" failed: ${error}`);
      }
    }
    this.events.emit(event, ...args);
  }

  addFilter(hook: string, fn: FilterFn, priority = 10) {
    return this.track(this.filters, hook, { priority, fn });
  }

  private track<T extends { priority: number }>(map: Map<string, T[]>, hook: string, entry: T) {
    const list = map.get(hook) ?? [];
    list.push(entry);
    list.sort((a, b) => a.priority - b.priority);
    map.set(hook, list);
    return () => {
      const current = map.get(hook) ?? [];
      map.set(
        hook,
        current.filter((item) => item !== entry),
      );
    };
  }

  async applyFilters<T>(hook: string, value: T, ...args: unknown[]): Promise<T> {
    let current: unknown = value;
    for (const filter of this.filters.get(hook) ?? []) {
      current = await filter.fn(current, ...args);
    }
    return current as T;
  }
}
