import { Component, OnDestroy, OnInit, Type, ViewChild, ViewContainerRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { DesignerHostComponent } from './designer-host.component';

/**
 * Route component of the quotation's design step
 * (`detail/:id/add/:index` and `detail/:id/edit/:subId/:index`).
 *
 * The designer itself is the standalone DesignerHostComponent. This class
 * stays as the thin shell the quotation module declares and routes to, so
 * the module and the routing files need no change; it creates the host in
 * its own view container, where the host sees the same ActivatedRoute.
 *
 * The designer reads its quotation and its window once, as it opens. From
 * one window straight to another the route stays and only its ids change,
 * so the designer is made again for the window now in the address.
 */
@Component({
  selector: 'app-sub-quotation-design',
  template: '<ng-container #host></ng-container>',
})
export class SubQuotationDesignComponent implements OnInit, OnDestroy {
  @ViewChild('host', { read: ViewContainerRef, static: true })
  private readonly host!: ViewContainerRef;

  /** The component made for each window. */
  protected designer: Type<unknown> = DesignerHostComponent;

  /** The quotation and window the designer on screen was made for. */
  private opened: string | null = null;
  private params?: Subscription;

  constructor(private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    this.params = this.route.paramMap.subscribe((params) => {
      // `index` is only the place in the list: "Save and add another" moves it without a new designer.
      const window = `${params.get('id')}/${params.get('subId') ?? ''}`;
      if (window !== this.opened) {
        this.opened = window;
        this.host.clear();
        this.host.createComponent(this.designer);
      }
    });
  }

  ngOnDestroy(): void {
    this.params?.unsubscribe();
  }
}
