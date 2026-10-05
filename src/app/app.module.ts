import { ACCESS_PARTS } from './shared/access/write.directive';
import { NgModule } from '@angular/core';
import {
  HashLocationStrategy,
  LocationStrategy,
  PathLocationStrategy,
} from '@angular/common';
import { BrowserModule, Title } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';

import { NgScrollbarModule } from 'ngx-scrollbar';

// Import routing module
import { AppRoutingModule } from './app-routing.module';

// Import app component
import { AppComponent } from './app.component';

// Import containers
import { CommandPaletteComponent, ShellComponent } from './containers';

import {
  AvatarModule,
  BadgeModule,
  BreadcrumbModule,
  ButtonGroupModule,
  ButtonModule,
  CardModule,
  DropdownModule,
  FooterModule,
  FormModule,
  GridModule,
  HeaderModule,
  ListGroupModule,
  NavModule,
  ProgressModule,
  SharedModule,
  SidebarModule,
  TabsModule,
  UtilitiesModule,
  AlertModule,
} from '@coreui/angular';
import { TokenInterceptor } from './shared/interceptors/token.interceptor';
import { IconModule, IconSetService } from '@coreui/icons-angular';
import { SharedCommonModule } from './shared/shared-common.module';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { AccessInterceptor } from './shared/access/access.interceptor';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { LoaderService } from 'src/app/shared/services/loader.service';
import { LoaderInterceptor } from 'src/app/shared/interceptors/loader.interceptor';
import { ProfileComponent } from './views/profile/profile.component';
import { BulkPriceUploadComponent } from './views/bulk-price-upload/bulk-price-upload.component';
import { SharedComponentsModule } from './shared/components/shared-components.module';
import { OwnRatesComponent } from './shared/access/own-rates.component';
const APP_CONTAINERS = [ShellComponent, CommandPaletteComponent];

@NgModule({
  declarations: [AppComponent, ...APP_CONTAINERS, ProfileComponent, BulkPriceUploadComponent],
  imports: [
    // Write buttons by ability and by plan (card T136): the bulk price upload is declared here.
    ...ACCESS_PARTS,
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    AvatarModule,
    BreadcrumbModule,
    ConfirmDialogModule,
    FooterModule,
    DropdownModule,
    GridModule,
    HeaderModule,
    SidebarModule,
    IconModule,
    NavModule,
    ButtonModule,
    FormModule,
    UtilitiesModule,
    ButtonGroupModule,
    ReactiveFormsModule,
    SidebarModule,
    SharedModule,
    ToastModule,
    TabsModule,
    ListGroupModule,
    ProgressModule,
    BadgeModule,
    ListGroupModule,
    CardModule,
    NgScrollbarModule,
    SharedCommonModule,
    HttpClientModule,
    AlertModule,
    ProgressBarModule,
    SharedComponentsModule,
    // "These are my rates now" in the example-rates line of the shell (card T146).
    OwnRatesComponent,
  ],
  providers: [
    // One toast queue and one confirm dialog for the whole app, lazy modules included.
    MessageService,
    ConfirmationService,
    {
      provide: LocationStrategy,
      useClass: HashLocationStrategy,
    },
    { provide: HTTP_INTERCEPTORS, useClass: TokenInterceptor, multi: true },
    IconSetService,
    Title,
    LoaderService,
    { provide: HTTP_INTERCEPTORS, useClass: LoaderInterceptor, multi: true },
    // 402 (locked or suspended company) and 403 by role, said in one plain line everywhere (card T117).
    { provide: HTTP_INTERCEPTORS, useClass: AccessInterceptor, multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
