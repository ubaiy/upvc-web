import { NgIf, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Directive,
  ElementRef,
  Injector,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { ToastService } from '../services/toast.service';
import { AccessState, PLAN_3D_LINE, WriteGate, allows, has3d, writeGate } from './access.models';
import { AccessService } from './access.service';

/**
 * A button or link that changes something (card T136):
 *
 *   <button appWrite="quotations.write" (click)="openNew()">New quotation</button>
 *
 * - the role has no such ability: the element is not shown and takes no press (Enter in a
 *   form presses its submit button even when hidden), so nobody ends in a 403;
 * - the account is read-only (locked or suspended): it stays in place but is off, says
 *   why in one line (the same line everywhere) and a press does nothing but say it again.
 *   The line across the top of the app leads to the Plan page.
 *
 * `disabled` of the element is left alone, so a screen's own `[disabled]` keeps working.
 * An empty ability (`[appWrite]="null"`) means the button only reads: it is never touched.
 */
const NO_GATE: WriteGate = { hidden: false, locked: false, reason: '' };

@Directive({ selector: '[appWrite]', standalone: true })
export class WriteDirective implements OnInit, OnChanges, OnDestroy {
  @Input('appWrite') ability: string | null = null;

  private gate: WriteGate = NO_GATE;
  private sub?: Subscription;
  private readonly stop: () => void;
  private hadTitle: string | null = null;

  constructor(private el: ElementRef<HTMLElement>, private renderer: Renderer2, private access: AccessService, private injector: Injector) {
    // In the capture phase, so it runs before the screen's own (click) and before routerLink.
    const onClick = (event: Event) => {
      if (!this.gate.locked && !this.gate.hidden) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.gate.hidden) {
        // Not shown, so not pressed by hand: Enter in a form presses its submit button even when it is hidden.
        return;
      }
      // Asked for only now: a screen with a write button needs no message service until one is refused.
      this.injector.get(ToastService).showError(this.gate.reason);
    };
    const node = this.el.nativeElement;
    node.addEventListener('click', onClick, true);
    this.stop = () => node.removeEventListener('click', onClick, true);
  }

  ngOnInit(): void {
    this.hadTitle = this.el.nativeElement.getAttribute('title');
    this.sub = this.access.state$.subscribe((state) => this.apply(state));
  }

  ngOnChanges(): void {
    if (this.sub) {
      this.apply(this.access.state);
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.stop();
  }

  private apply(state: AccessState): void {
    const node = this.el.nativeElement;
    const gate = (this.gate = this.ability ? writeGate(state, this.ability) : NO_GATE);
    if (gate.hidden) {
      this.renderer.setAttribute(node, 'hidden', '');
      this.renderer.setStyle(node, 'display', 'none', 1);
    } else {
      this.renderer.removeAttribute(node, 'hidden');
      this.renderer.removeStyle(node, 'display');
    }
    if (gate.locked) {
      this.renderer.setAttribute(node, 'aria-disabled', 'true');
      this.renderer.setAttribute(node, 'title', gate.reason);
      this.renderer.addClass(node, 'is-locked');
      this.renderer.setStyle(node, 'opacity', '0.55');
      this.renderer.setStyle(node, 'cursor', 'not-allowed');
    } else {
      this.renderer.removeAttribute(node, 'aria-disabled');
      this.renderer.removeClass(node, 'is-locked');
      this.renderer.removeStyle(node, 'opacity');
      this.renderer.removeStyle(node, 'cursor');
      if (this.hadTitle === null) {
        this.renderer.removeAttribute(node, 'title');
      } else {
        this.renderer.setAttribute(node, 'title', this.hadTitle);
      }
    }
  }
}

/**
 * Draws its content only when the company's plan has 3D:
 *
 *   <button *appHas3d (click)="show3d()">3D</button>
 *   <app-plan-lock label="3D"></app-plan-lock>
 *
 * The lock beside it draws itself only when the plan has none.
 */
@Directive({ selector: '[appHas3d]', standalone: true })
export class Has3dDirective implements OnInit, OnDestroy {
  private shown = false;
  private sub?: Subscription;

  constructor(private template: TemplateRef<unknown>, private view: ViewContainerRef, private access: AccessService) {}

  ngOnInit(): void {
    this.sub = this.access.state$.subscribe((state) => {
      const show = has3d(state);
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

/**
 * What stands in place of a 3D button on a plan without 3D: a lock, the button's own
 * words and "Available on the Business plan". For the owner it is a link to the Plan
 * page; anyone else is told to ask the owner. Never an error.
 */
@Component({
  selector: 'app-plan-lock',
  standalone: true,
  imports: [NgIf, NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="locked">
      <a *ngIf="canSeePlan; else plain" class="plan-lock" [class.row]="look === 'row'" [class.seg]="look === 'seg'"
        routerLink="/profile" [queryParams]="{ tab: 'plan' }" [attr.title]="line + '. See plans.'" data-lock="3d">
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </a>
      <ng-template #plain>
        <span class="plan-lock" [class.row]="look === 'row'" [class.seg]="look === 'seg'" [attr.title]="line + '. Ask the owner of the account.'" data-lock="3d">
          <ng-container *ngTemplateOutlet="body"></ng-container>
        </span>
      </ng-template>
      <ng-template #body>
        <svg class="ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2"></rect>
          <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
        </svg>
        <span class="what">{{ label }}</span>
        <span class="why">{{ line }}</span>
      </ng-template>
    </ng-container>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .plan-lock {
        display: inline-flex;
        align-items: center;
        gap: var(--s-2, 8px);
        min-height: 36px;
        padding: 0 var(--s-3, 12px);
        border: 1px dashed var(--border-strong, #c4c9d2);
        border-radius: var(--r-2, 8px);
        color: var(--text-2, #4b5563);
        font-size: var(--fs-sm, 13px);
        text-decoration: none;
        white-space: nowrap;
      }
      a.plan-lock:hover,
      a.plan-lock:focus-visible {
        color: var(--text, #111827);
        border-style: solid;
      }
      .plan-lock .what {
        font-weight: 600;
      }
      .plan-lock .why {
        color: var(--text-3, #6b7280);
      }
      .plan-lock.row {
        border: 0;
        padding: 0 var(--s-3, 12px);
      }
      .plan-lock.seg {
        border: 0;
        min-height: 28px;
        padding: 0 var(--s-2, 8px);
      }
      @media (max-width: 640px) {
        .plan-lock {
          white-space: normal;
          min-height: 44px;
          flex-wrap: wrap;
          row-gap: 0;
        }
      }
    `,
  ],
})
export class PlanLockComponent implements OnInit, OnDestroy {
  /** The words of the button it stands for. */
  @Input() label = '3D';
  /** `row`: in a list of "add" rows; `seg`: inside the 2D | 3D switch. */
  @Input() look: 'button' | 'row' | 'seg' = 'button';

  readonly line = PLAN_3D_LINE;
  locked = false;
  canSeePlan = true;
  private sub?: Subscription;

  constructor(private access: AccessService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.access.state$.subscribe((state) => {
      this.locked = !has3d(state);
      this.canSeePlan = allows(state, 'billing.view');
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

/** For the `imports` of a module or a standalone component. */
export const ACCESS_PARTS = [WriteDirective, Has3dDirective, PlanLockComponent] as const;
