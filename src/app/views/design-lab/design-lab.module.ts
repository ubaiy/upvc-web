/**
 * Design Lab — dev-only lazy module hosting the /design-lab playground for
 * the standalone DesignCanvasComponent. New files only; the sole change
 * outside this folder and src/app/shared/design-canvas is the one lazy
 * route in app-routing.module.ts.
 */

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DesignLabComponent } from './design-lab.component';

const routes: Routes = [{ path: '', component: DesignLabComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes), DesignLabComponent],
})
export class DesignLabModule {}
