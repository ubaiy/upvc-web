import { ACCESS_PARTS } from 'src/app/shared/access/write.directive';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { UpdateRatesDialogComponent } from '../bulk-price-upload/update-rates-dialog.component';
import { CatalogueComponent } from './catalogue.component';
import { ColourDialogComponent } from './colour-dialog.component';
import { ItemDialogComponent } from './item-dialog.component';
import { MastersRoutingModule } from './masters-routing.module';
import { ProfileDialogComponent } from './profile-dialog.component';
import { RateCellComponent } from './rate-cell.component';

/** The Catalogue page (card U5): one page, four tabs, under `/masters`. */
@NgModule({
  declarations: [CatalogueComponent],
  imports: [...ACCESS_PARTS, 
    CommonModule,
    MastersRoutingModule,
    SharedComponentsModule,
    ButtonModule,
    DialogModule,
    RateCellComponent,
    ProfileDialogComponent,
    ColourDialogComponent,
    ItemDialogComponent,
    UpdateRatesDialogComponent,
  ],
})
export class MastersModule {}
