import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { InrPipe } from '../pipes/inr.pipe';
import { BulkBarComponent } from './bulk-bar/bulk-bar.component';
import { CalloutComponent } from './callout/callout.component';
import { EmptyStateComponent } from './empty-state/empty-state.component';
import { IconComponent } from './icon/icon.component';
import { PageHeaderComponent } from './page-header/page-header.component';
import { QuoteStatusComponent } from './quote-status/quote-status.component';
import { StatComponent } from './stat/stat.component';
import { TableLabelsDirective } from './table-labels/table-labels.directive';
import { TotalsComponent } from './totals/totals.component';
import { UndoToastComponent } from './undo-toast/undo-toast.component';
import { WindowThumbComponent } from './window-thumb/window-thumb.component';

const COMPONENTS = [
  BulkBarComponent,
  CalloutComponent,
  EmptyStateComponent,
  IconComponent,
  PageHeaderComponent,
  QuoteStatusComponent,
  StatComponent,
  TableLabelsDirective,
  TotalsComponent,
  UndoToastComponent,
  WindowThumbComponent,
];

/**
 * The shared building blocks of the design system. Import this module into a
 * feature module to use <app-page-header>, <app-icon>, <app-stat>,
 * <app-empty-state>, <app-callout>, <app-totals>, <app-quote-status>,
 * <app-window-thumb>, <app-bulk-bar> and the `inr` pipe. (<app-undo-toast> is
 * placed once, in AppComponent; screens call UndoService.) It also carries
 * TableLabelsDirective, which needs no markup: every `<table class="table">`
 * in the importing module becomes row cards on a phone.
 *
 * Every piece is shown at /ui. Screen cards do not edit this folder; a screen
 * that needs a new shared piece asks for a follow-up to card U0.
 */
@NgModule({
  declarations: COMPONENTS,
  imports: [CommonModule, RouterModule, InrPipe],
  exports: [...COMPONENTS, InrPipe],
})
export class SharedComponentsModule {}
