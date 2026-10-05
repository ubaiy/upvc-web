import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MenuModule } from 'primeng/menu';
import { AddressFieldsComponent } from '../../shared/components/address-fields/address-fields.component';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { CustomersRoutingModule } from './customers-routing.module';
import { CustomersComponent } from './customers.component';
import { DetailsComponent } from './details/details.component';

@NgModule({
  imports: [
    CommonModule,
    CustomersRoutingModule,
    SharedComponentsModule,
    AddressFieldsComponent,
    FormsModule,
    ReactiveFormsModule,
    MenuModule,
  ],
  declarations: [CustomersComponent, DetailsComponent],
})
export class CustomersModule {}
