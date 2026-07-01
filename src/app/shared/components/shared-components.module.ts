import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PageHeaderComponent } from './page-header/page-header.component';

/**
 * Shared presentational components for the design system.
 * Import this module into any feature/page module that needs the
 * reusable UI building blocks (e.g. <app-page-header>), then use the
 * exported components in that module's templates.
 */
@NgModule({
  declarations: [PageHeaderComponent],
  imports: [CommonModule],
  exports: [PageHeaderComponent],
})
export class SharedComponentsModule {}
