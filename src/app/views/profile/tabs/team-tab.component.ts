import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { Observable, Subscription, finalize } from 'rxjs';

import { readOnlyReason } from 'src/app/shared/access/access.models';
import { AccessService } from 'src/app/shared/access/access.service';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { Invite, Team, TeamAnswer, TeamRefusal, TeamService, TeamUser, seatsLine, teamRefusal } from '../team.service';

type RowAction = 'deactivate' | 'reactivate' | 'remove' | 'resend';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Settings → Team (card T117): the people of the company, their role and status, the seats of the
 * plan, and what the owner can do: invite, change a role, deactivate, reactivate, remove, make a new
 * link. Only a user with `team.manage` sees the tab; the api refuses anyone else.
 *
 * No e-mail is sent yet: an invitation answers with a link the owner copies and passes on.
 */
@Component({
  selector: 'app-settings-team',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DialogModule, SharedModule, SharedComponentsModule],
  templateUrl: './team-tab.component.html',
  styleUrls: ['../settings-tab.scss', './team-tab.component.scss'],
})
export class TeamTabComponent implements OnInit, OnDestroy {
  state: 'loading' | 'error' | 'ready' = 'loading';
  team: Team | null = null;

  /** The result or refusal of the last action, above the list. */
  notice: (TeamRefusal & { tone: 'success' | 'warn' }) | null = null;
  /** The link of the last invitation, to copy and pass on. */
  invited: { name: string; email: string; link: string; expires: string } | null = null;
  copied = false;

  dialog: 'invite' | 'role' | 'confirm' | null = null;
  busy = false;
  submitted = false;
  /** Refusal shown inside the open dialog. */
  refusal: TeamRefusal | null = null;

  form = { name: '', email: '', role: '' };
  target: TeamUser | null = null;
  action: RowAction | null = null;
  newRole = '';

  /** The company is locked or suspended: every change is refused by the api, so the buttons say why. */
  lockedReason = '';
  private companyName = '';
  private sub?: Subscription;

  constructor(private service: TeamService, private access: AccessService) {}

  ngOnInit(): void {
    this.sub = this.access.state$.subscribe((state) => {
      this.lockedReason = state.subscription?.read_only ? readOnlyReason(state.subscription) : '';
      this.companyName = state.me?.company?.name ?? state.subscription?.company?.name ?? '';
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get seats(): string {
    return seatsLine(this.team?.seats);
  }

  get full(): boolean {
    return !!this.team && this.team.seats.free === false;
  }

  load(): void {
    this.state = this.team ? 'ready' : 'loading';
    this.service.team().subscribe({
      next: (team) => {
        this.team = team;
        this.state = 'ready';
      },
      error: () => (this.state = this.team ? 'ready' : 'error'),
    });
  }

  fullName(user: TeamUser): string {
    return [user.name, user.last_name].filter(Boolean).join(' ');
  }

  statusLabel(user: TeamUser): string {
    return user.status === 'invited' ? 'Invited' : user.status === 'deactivated' ? 'Deactivated' : 'Active';
  }

  roleDescription(code: string): string {
    return this.team?.roles.find((role) => role.code === code)?.description ?? '';
  }

  // ---- invite ----

  openInvite(): void {
    const roles = this.team?.roles ?? [];
    this.form = { name: '', email: '', role: (roles.find((role) => role.code !== 'owner') ?? roles[0])?.code ?? '' };
    this.open('invite');
  }

  get nameError(): string {
    return this.submitted && !this.form.name.trim() ? 'Enter the name' : '';
  }

  get emailError(): string {
    if (!this.submitted) {
      return '';
    }
    const email = this.form.email.trim();
    return !email ? 'Enter the e-mail address' : EMAIL.test(email) ? '' : 'This does not look like an e-mail address';
  }

  sendInvite(): void {
    this.submitted = true;
    if (this.busy || !this.form.name.trim() || !EMAIL.test(this.form.email.trim()) || !this.form.role) {
      return;
    }
    const body = { name: this.form.name.trim(), email: this.form.email.trim(), role: this.form.role };
    this.run(this.service.invite(body), (answer) => {
      this.notice = null;
      this.showLink(body.name, body.email, answer.invite);
    });
  }

  // ---- one person ----

  openRole(user: TeamUser): void {
    this.target = user;
    this.newRole = user.role;
    this.open('role');
  }

  saveRole(): void {
    const user = this.target;
    if (!user || this.busy) {
      return;
    }
    if (this.newRole === user.role) {
      this.dialog = null;
      return;
    }
    this.run(this.service.setRole(user.id, this.newRole), (answer) =>
      this.say(`${this.fullName(user)} is now ${answer.user?.role_name ?? this.newRole}.`)
    );
  }

  ask(user: TeamUser, action: RowAction): void {
    this.target = user;
    this.action = action;
    this.open('confirm');
  }

  get confirmTitle(): string {
    const name = this.target ? this.fullName(this.target) : '';
    switch (this.action) {
      case 'deactivate':
        return `Deactivate ${name}?`;
      case 'reactivate':
        return `Reactivate ${name}?`;
      case 'remove':
        return `Remove ${name}?`;
      default:
        return `New link for ${name}?`;
    }
  }

  get confirmText(): string {
    switch (this.action) {
      case 'deactivate':
        return 'They are signed out everywhere at once and cannot sign in. Their seat becomes free. What they made stays with the company.';
      case 'reactivate':
        return 'They can sign in again and take a seat of your plan.';
      case 'remove':
        return 'Their sign-in is deleted and the seat becomes free. Quotations and orders they made stay with the company. This cannot be undone.';
      default:
        return 'A new link is made to set the password. The earlier link stops working.';
    }
  }

  get confirmButton(): string {
    switch (this.action) {
      case 'deactivate':
        return 'Deactivate';
      case 'reactivate':
        return 'Reactivate';
      case 'remove':
        return 'Remove';
      default:
        return 'Make a new link';
    }
  }

  confirm(): void {
    const user = this.target;
    if (!user || !this.action || this.busy) {
      return;
    }
    const name = this.fullName(user);
    switch (this.action) {
      case 'deactivate':
        return this.run(this.service.deactivate(user.id), () => this.say(`${name} is deactivated and signed out. The seat is free.`));
      case 'reactivate':
        return this.run(this.service.reactivate(user.id), () => this.say(`${name} can sign in again.`));
      case 'remove':
        return this.run(this.service.remove(user.id), () => this.say(`${name} is removed. The seat is free.`));
      default:
        return this.run(this.service.resendInvite(user.id), (answer) => {
          this.notice = null;
          this.showLink(name, user.email, answer.invite);
        });
    }
  }

  copy(input: HTMLInputElement): void {
    const done = () => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2500);
    };
    const bySelection = () => {
      input.select();
      try {
        document.execCommand('copy');
      } catch {
        // The link stays selected: Ctrl C copies it.
      }
      done();
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(input.value).then(done, bySelection);
    } else {
      bySelection();
    }
  }

  close(): void {
    if (!this.busy) {
      this.dialog = null;
    }
  }

  private open(dialog: 'invite' | 'role' | 'confirm'): void {
    this.submitted = false;
    this.refusal = null;
    this.dialog = dialog;
  }

  private say(text: string): void {
    this.notice = { tone: 'success', text };
  }

  /**
   * The api's link is the set-password page with token, e-mail and invite=1. The company's name is added
   * so that page can say "Set your password to join <company>" (the visitor has no session to ask with).
   */
  private showLink(name: string, email: string, invite?: Invite): void {
    if (!invite?.link) {
      return;
    }
    const company = this.companyName && !invite.link.includes('company=') ? `&company=${encodeURIComponent(this.companyName)}` : '';
    this.invited = { name, email, link: invite.link + company, expires: invite.expires_at };
    this.copied = false;
  }

  private run(request: Observable<TeamAnswer>, done: (answer: TeamAnswer) => void): void {
    this.busy = true;
    this.refusal = null;
    request.pipe(finalize(() => (this.busy = false))).subscribe({
      next: (answer) => {
        this.dialog = null;
        done(answer);
        this.load();
        // The seats of the plan are shown on the Plan page too.
        this.access.refreshSubscription();
      },
      error: (err) => {
        const refusal = teamRefusal(err);
        if (this.dialog === 'invite' || this.dialog === 'role') {
          this.refusal = refusal;
        } else {
          this.dialog = null;
          this.notice = { ...refusal, tone: 'warn' };
        }
        if (err?.status === 404) {
          this.load();
        }
      },
    });
  }
}
