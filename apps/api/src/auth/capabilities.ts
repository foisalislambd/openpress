export type RoleName = 'ADMIN' | 'EDITOR' | 'AUTHOR' | 'CONTRIBUTOR' | 'SUBSCRIBER';

export type Capability =
  | 'read'
  | 'edit_posts'
  | 'edit_others_posts'
  | 'publish_posts'
  | 'delete_posts'
  | 'delete_others_posts'
  | 'edit_pages'
  | 'publish_pages'
  | 'delete_pages'
  | 'moderate_comments'
  | 'upload_files'
  | 'manage_categories'
  | 'edit_theme_options'
  | 'activate_plugins'
  | 'manage_options'
  | 'list_users'
  | 'create_users'
  | 'edit_users'
  | 'delete_users';

const ALL: Capability[] = [
  'read',
  'edit_posts',
  'edit_others_posts',
  'publish_posts',
  'delete_posts',
  'delete_others_posts',
  'edit_pages',
  'publish_pages',
  'delete_pages',
  'moderate_comments',
  'upload_files',
  'manage_categories',
  'edit_theme_options',
  'activate_plugins',
  'manage_options',
  'list_users',
  'create_users',
  'edit_users',
  'delete_users',
];

/** WordPress-like defaults. Admin is the only role with the full set. */
export const ROLE_CAPABILITIES: Record<RoleName, Capability[]> = {
  ADMIN: ALL,
  EDITOR: [
    'read',
    'edit_posts',
    'edit_others_posts',
    'publish_posts',
    'delete_posts',
    'delete_others_posts',
    'edit_pages',
    'publish_pages',
    'delete_pages',
    'moderate_comments',
    'upload_files',
    'manage_categories',
    'edit_theme_options',
  ],
  AUTHOR: [
    'read',
    'edit_posts',
    'publish_posts',
    'delete_posts',
    'upload_files',
    'manage_categories',
  ],
  CONTRIBUTOR: ['read', 'edit_posts', 'delete_posts'],
  SUBSCRIBER: ['read'],
};

export function capabilitiesFor(role: string): Capability[] {
  return ROLE_CAPABILITIES[role as RoleName] ?? [];
}

export function can(role: string, capability: Capability): boolean {
  return capabilitiesFor(role).includes(capability);
}

export function publishCapability(type: string): Capability {
  return type === 'PAGE' ? 'publish_pages' : 'publish_posts';
}
