import type { Permission } from '@openchess/contracts';

export const DEFAULT_COLOR = '#5c554b';

export type RoleInput = {
  name: string;
  color: string;
  permissions: Permission[];
};
