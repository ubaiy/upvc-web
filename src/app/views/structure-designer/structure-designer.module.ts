/**
 * Structure designer — the lazy module of /structure-designer (card T100).
 * three.js is imported only by files under this folder, so it stays in this
 * chunk and a user who never opens the designer downloads none of it.
 */

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StructureDesignerComponent } from './structure-designer.component';

const routes: Routes = [{ path: '', component: StructureDesignerComponent, title: 'Structure designer' }];

@NgModule({
  imports: [RouterModule.forChild(routes), StructureDesignerComponent],
})
export class StructureDesignerModule {}
