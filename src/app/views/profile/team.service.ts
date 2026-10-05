import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { quiet } from 'src/app/shared/interceptors/request-options';
import { ApiHttpService } from 'src/app/shared/services/api-http.service';

/** One person of the company, as GET team answers (phase-51 section 6). */
export interface TeamUser {
  id: number;
  name: string;
  last_name: string | null;
  email: string;
  role: string;
  role_name: string;
  status: 'active' | 'invited' | 'deactivated';
  last_login_at: string | null;
  invited_at: string | null;
  is_you: boolean;
}

export interface TeamSeats {
  used: number;
  /** `null`: the plan has no limit. */
  allowed: number | null;
  free: boolean;
}

export interface TeamRole {
  code: string;
  name: string;
  description: string;
}

export interface Team {
  users: TeamUser[];
  seats: TeamSeats;
  roles: TeamRole[];
}

export interface Invite {
  link: string;
  expires_at: string;
}

export interface TeamAnswer {
  user?: TeamUser;
  invite?: Invite;
  seats?: TeamSeats;
}

/** The team routes of the api: api/v1/team*. All need `team.manage` (the owner). */
@Injectable({ providedIn: 'root' })
export class TeamService {
  constructor(private api: ApiHttpService) {}

  team(): Observable<Team> {
    return this.api.get('team', quiet()).pipe(map((res) => res.data));
  }

  invite(body: { name: string; email: string; role: string }): Observable<TeamAnswer> {
    return this.post('team/invite', body);
  }

  resendInvite(id: number): Observable<TeamAnswer> {
    return this.post(`team/${id}/resend-invite`);
  }

  setRole(id: number, role: string): Observable<TeamAnswer> {
    return this.post(`team/${id}/role`, { role });
  }

  deactivate(id: number): Observable<TeamAnswer> {
    return this.post(`team/${id}/deactivate`);
  }

  reactivate(id: number): Observable<TeamAnswer> {
    return this.post(`team/${id}/reactivate`);
  }

  remove(id: number): Observable<TeamAnswer> {
    return this.post(`team/${id}/remove`);
  }

  private post(url: string, body: unknown = {}): Observable<TeamAnswer> {
    return this.api.post(url, body, quiet()).pipe(map((res) => res.data ?? {}));
  }
}

export interface TeamRefusal {
  text: string;
  /** The way out is a larger plan: the message carries a link to the Plan page. */
  plan?: boolean;
  /** The refusal was already said by the shared interceptor (402, 403): nothing more to show. */
  said?: boolean;
}

/** "3 of 5 seats used", or "3 people, no seat limit" for a plan without one. */
export function seatsLine(seats: TeamSeats | null | undefined): string {
  if (!seats) {
    return '';
  }
  if (seats.allowed === null || seats.allowed === undefined) {
    return `${seats.used} ${seats.used === 1 ? 'seat' : 'seats'} used, no limit on your plan`;
  }
  return `${seats.used} of ${seats.allowed} seats used`;
}

/** A refusal of a team route in plain words, with what to do about it. */
export function teamRefusal(err: unknown): TeamRefusal {
  const res = err instanceof HttpErrorResponse ? err : null;
  const body: any = res?.error && typeof res.error === 'object' ? res.error : {};
  if (body.code === 'seat_limit') {
    const allowed = Number(body.seats_allowed);
    const count = Number.isFinite(allowed) && body.seats_allowed !== null && body.seats_allowed !== undefined;
    return {
      text:
        (count ? `Your plan allows ${allowed} ${allowed === 1 ? 'user' : 'users'} and all are in use.` : 'Every seat of your plan is in use.') +
        ' Deactivate or remove someone, or move to a larger plan.',
      plan: true,
    };
  }
  if (body.code === 'last_owner') {
    return { text: 'This is the only owner of the account. Make someone else an owner first, then try again.' };
  }
  if (body.code === 'not_invited') {
    return { text: 'This person has already set a password, so no new link is needed. They can use "Forgot password" on the sign-in page.' };
  }
  if (res?.status === 402 || body.code === 'forbidden_for_role') {
    return { text: body.message || 'This was not saved.', said: true };
  }
  if (res?.status === 422) {
    const errors = body.errors && typeof body.errors === 'object' ? Object.values(body.errors) : [];
    const first = errors.map((list: any) => (Array.isArray(list) ? list[0] : list)).find((line) => typeof line === 'string' && line);
    return { text: (first as string) || body.message || 'Check the details and try again.' };
  }
  if (res?.status === 404) {
    return { text: 'This person is no longer in your team. The list has been loaded again.' };
  }
  if (res?.status === 0) {
    return { text: 'No connection. Nothing was changed. Check your connection and try again.' };
  }
  return { text: body.message || 'Something went wrong on our side. Nothing was changed.' };
}
