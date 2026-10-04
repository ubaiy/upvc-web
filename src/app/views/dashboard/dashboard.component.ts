import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { LocalStoreService } from 'src/app/shared/services/local-storage.service';
import { IUserDto } from 'src/app/shared/model/user.model';
import { DashboardService } from './dashboard.service';
import { AttentionItem, HomeQuotation, HomeView, greeting, shortDate } from './home-data';

type HomeState = 'loading' | 'ready' | 'error';

/**
 * Home: three figures, what needs the fabricator today, and the latest
 * quotations. Every row opens its quotation in one click.
 */
@Component({
  templateUrl: 'dashboard.component.html',
  styleUrls: ['dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  state: HomeState = 'loading';
  view: HomeView | null = null;

  readonly today = new Date();
  readonly title: string;
  readonly dateLine = this.today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  readonly placeholders = [0, 1, 2];

  private request?: Subscription;

  constructor(
    private _ls: LocalStoreService,
    private dataService: DashboardService
  ) {
    const user: IUserDto | null = this._ls.getItem('User');
    const name = (user?.name || '').trim();
    this.title = name ? `${greeting(this.today)}, ${name}` : greeting(this.today);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  load(): void {
    this.request?.unsubscribe();
    this.state = 'loading';
    this.request = this.dataService.getHome(this.today).subscribe({
      next: (view) => {
        this.view = view;
        this.state = 'ready';
      },
      error: () => {
        this.state = 'error';
      },
    });
  }

  link(quotation: HomeQuotation): any[] {
    return ['/quotation/detail', quotation.id];
  }

  /** The date in the last column of "Recent quotations"; empty until the API sends dates. */
  dateOf(quotation: HomeQuotation): string {
    const date = quotation.edited || quotation.created;
    return date ? shortDate(date, this.today) : '';
  }

  trackItem(_: number, item: AttentionItem): number {
    return item.quotation.id;
  }

  trackQuotation(_: number, quotation: HomeQuotation): number {
    return quotation.id;
  }
}
