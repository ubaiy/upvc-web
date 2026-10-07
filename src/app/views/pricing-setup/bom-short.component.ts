import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { InrPipe } from 'src/app/shared/pipes/inr.pipe';
import { BomShort } from './pricing-setup.models';

/** "frame", "sash + mesh sash": the role codes of a row as words. */
export function roleWords(role: string): string {
  return role.replace(/_/g, ' ').replace(/\+/g, ' + ');
}

/** The bill of materials of one window in short, as the api cut it: the Compare tab and the trial of the quick setup show the same table. */
@Component({
  selector: 'app-setup-bom',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedComponentsModule, InrPipe],
  styleUrls: ['./setup.scss'],
  template: `
    <table class="table" *ngIf="bom as b">
      <thead>
        <tr><th>Part</th><th>Item</th><th class="right">Quantity</th><th class="right">Weight</th><th class="right">Amount</th></tr>
      </thead>
      <tbody>
        <tr *ngFor="let p of b.profiles">
          <td>{{ role(p.role) }}</td>
          <td>{{ p.code }} {{ p.name }}</td>
          <td class="right">{{ p.metres }} m</td>
          <td class="right">{{ p.kg }} kg</td>
          <td class="right">{{ p.amount | inr }}</td>
        </tr>
        <tr *ngFor="let g of b.glass">
          <td>glass</td>
          <td>{{ g.name }}</td>
          <td class="right">{{ g.qty }} {{ g.unit }}</td>
          <td></td>
          <td class="right">{{ g.amount | inr }}</td>
        </tr>
        <tr>
          <td>hardware</td>
          <td>{{ b.hardware_set ? b.hardware_set.name + ' (' + b.hardware_set.code + ')' : 'No hardware set' }}</td>
          <td class="right">{{ b.hardware.items }} {{ b.hardware.items === 1 ? 'item' : 'items' }}</td>
          <td></td>
          <td class="right">{{ b.hardware.amount | inr }}</td>
        </tr>
        <tr><td>labour</td><td>Fabrication at {{ b.figures['labour_rate'] | inr }} per sq ft</td><td></td><td></td><td class="right">{{ b.totals.labour | inr }}</td></tr>
        <tr><td>overhead</td><td>{{ b.figures['overhead_pct'] }} percent on material and labour</td><td></td><td></td><td class="right">{{ b.totals.overhead | inr }}</td></tr>
        <tr *ngIf="b.totals.installation"><td>installation</td><td>At {{ b.figures['installation_rate'] | inr }} per sq ft</td><td></td><td></td><td class="right">{{ b.totals.installation | inr }}</td></tr>
        <tr><td><strong>One window</strong></td><td></td><td></td><td></td><td class="right"><strong>{{ b.totals.cost | inr }}</strong></td></tr>
      </tbody>
    </table>
    <ng-container *ngIf="bom as b">
      <p class="small">
        Wastage in the quantities: profile {{ b.figures['profile_wastage_pct'] }} percent, steel {{ b.figures['steel_wastage_pct'] }} percent, glass {{ b.figures['glass_wastage_pct'] }} percent.
        Profile {{ b.figures['profile_rate_kg'] | inr }} per kg, steel {{ b.figures['steel_rate_kg'] | inr }} per kg.
        <a routerLink="/pricing-setup" [queryParams]="{ tab: 'figures' }">Rates and figures</a>
      </p>
      <ul class="todo" *ngIf="b.warnings.length">
        <li *ngFor="let n of b.warnings"><app-icon class="mark" name="info"></app-icon><span>{{ n }}</span></li>
      </ul>
    </ng-container>
  `,
})
export class BomShortComponent {
  @Input() bom: BomShort | null | undefined;
  role = roleWords;
}
