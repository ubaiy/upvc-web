import { Directive, Input, OnDestroy, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';
import { Subscription } from 'rxjs';

import { allows } from './access.models';
import { AccessService } from './access.service';

/**
 * Draws a button, a link or a column only for a user whose role has the ability:
 *
 *   <button *appCan="'quotations.write'" ...>New quotation</button>
 *
 * Follows the abilities of GET me; before they are known nothing is hidden.
 */
@Directive({ selector: '[appCan]', standalone: true })
export class CanDirective implements OnInit, OnDestroy {
  @Input('appCan') ability: string | null = null;

  private shown = false;
  private sub?: Subscription;

  constructor(private template: TemplateRef<unknown>, private view: ViewContainerRef, private access: AccessService) {}

  ngOnInit(): void {
    this.sub = this.access.state$.subscribe((state) => {
      const show = allows(state, this.ability);
      if (show && !this.shown) {
        this.view.createEmbeddedView(this.template);
      } else if (!show && this.shown) {
        this.view.clear();
      }
      this.shown = show;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
