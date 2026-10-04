import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { IUserDto } from 'src/app/shared/model/user.model';
import { ProfileService } from '../profile.service';

/**
 * Settings → Team (gap G10). A placeholder until the API has invitations and
 * roles (SaaS M1/M2): it shows the one login there is and says what is coming.
 */
@Component({
  selector: 'app-settings-team',
  standalone: true,
  imports: [CommonModule, SharedComponentsModule],
  styleUrls: ['../settings-tab.scss'],
  template: `
    <div class="settings-col stack-6">
      <section class="card" aria-labelledby="h-team">
        <div class="card-head">
          <div>
            <h2 id="h-team">People</h2>
            <p>Everyone who can sign in to this company.</p>
          </div>
        </div>

        <div class="card-pad sk-card" *ngIf="state === 'loading'" aria-busy="true" aria-label="Loading team">
          <span class="skeleton" style="width: 50%"></span>
        </div>

        <div class="card-pad" *ngIf="state === 'error'">
          <app-callout tone="warn">
            We could not load your team.
            <button action type="button" class="btn btn-secondary btn-sm" (click)="load()">Try again</button>
          </app-callout>
        </div>

        <table class="table" *ngIf="state === 'ready' && user as member">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="title">{{ member.name }} {{ member.last_name }} <span class="muted">(you)</span></td>
              <td class="muted">{{ member.email }}</td>
              <td><span class="badge plain">Owner</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <app-empty-state
        class="card"
        icon="user-plus"
        title="Invite your team soon"
        text="Estimators and viewers will get their own sign-in, with prices and margins shown only to the roles you choose. For now, this company has one sign-in."
      ></app-empty-state>
    </div>
  `,
})
export class TeamTabComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  user: IUserDto | null = null;

  constructor(private profile: ProfileService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.profile.getProfile().subscribe({
      next: (res) => {
        if (res?.success) {
          this.user = res.data;
          this.state = 'ready';
        } else {
          this.state = 'error';
        }
      },
      error: () => (this.state = 'error'),
    });
  }
}
