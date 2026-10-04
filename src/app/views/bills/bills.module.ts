import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { BillsRoutingModule } from './bills-routing.module';
import { ListComponent } from './list/list.component';

@NgModule({
  declarations: [ListComponent],
  imports: [CommonModule, BillsRoutingModule, SharedComponentsModule, FormsModule, MenuModule, DialogModule, ButtonModule],
})
export class BillsModule {}
