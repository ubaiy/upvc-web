/**
 * Design Lab guard — the playground is a dev tool. It matches only when the
 * build's environment enables it (`designLab: true` in environment.ts,
 * `false` in environment.prod.ts), so a production build answers
 * /design-lab with the normal not-found route.
 */

import { CanMatchFn } from '@angular/router';
import { environment } from 'src/environments/environment';

export function designLabEnabled(env: { designLab?: boolean }): boolean {
  return env.designLab === true;
}

export const designLabGuard: CanMatchFn = () => designLabEnabled(environment);
