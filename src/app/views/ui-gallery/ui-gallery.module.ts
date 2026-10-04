import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TabMenuModule } from 'primeng/tabmenu';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { UiGalleryComponent } from './ui-gallery.component';

/** Review page for the design system, served at /ui. Loaded only when visited. */
@NgModule({
  declarations: [UiGalleryComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: '', component: UiGalleryComponent, title: 'Components' }]),
    SharedComponentsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    DropdownModule,
    InputNumberModule,
    InputTextModule,
    MenuModule,
    ProgressBarModule,
    SelectButtonModule,
    SkeletonModule,
    TableModule,
    TabMenuModule,
    TagModule,
    TooltipModule,
  ],
})
export class UiGalleryModule {}
