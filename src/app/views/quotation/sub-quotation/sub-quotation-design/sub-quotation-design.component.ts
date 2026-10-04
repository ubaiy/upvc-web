import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { DesignerHostComponent } from './designer-host.component';

/**
 * Route component of the quotation's design step
 * (`detail/:id/add/:index` and `detail/:id/edit/:subId/:index`).
 *
 * The designer itself is the standalone DesignerHostComponent. This class
 * stays as the thin shell the quotation module declares and routes to, so
 * the module and the routing files need no change; it creates the host in
 * its own view container, where the host sees the same ActivatedRoute.
 */
@Component({
  selector: 'app-sub-quotation-design',
  template: '<ng-container #host></ng-container>',
})
export class SubQuotationDesignComponent implements OnInit {
  @ViewChild('host', { read: ViewContainerRef, static: true })
  private readonly host!: ViewContainerRef;

  ngOnInit(): void {
    this.host.createComponent(DesignerHostComponent);
  }
}
