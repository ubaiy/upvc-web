/**
 * Design Lab — dev-only lazy module hosting the /design-lab playground for
 * the standalone DesignCanvasComponent. The route is guarded by
 * designLabGuard, so it exists only where the environment enables it.
 */

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DesignLabComponent } from './design-lab.component';
import { designLabGuard } from './design-lab.guard';

const routes: Routes = [
  { path: '', component: DesignLabComponent, canMatch: [designLabGuard] },
];

@NgModule({
  imports: [RouterModule.forChild(routes), DesignLabComponent],
})
export class DesignLabModule {}
