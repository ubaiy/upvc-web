import { Injectable, Injector } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { documentTitle } from '../../shared/configs/product';
import { findNavItem } from './nav';
import { ShellComponent } from './shell.component';
import { WorkspaceService } from './workspace.service';

/**
 * The browser tab title of every route, set in one place: "<page> · <owner>".
 *
 * The page is the route's `title`, else its `data.title`, else the label of
 * the menu item the address belongs to. The owner is the company name on the
 * screens inside the shell and the product name everywhere else.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private page?: string;
  private inShell = false;
  private company = '';
  private listening = false;

  constructor(private title: Title, private injector: Injector) {
    super();
  }

  override updateTitle(state: RouterStateSnapshot): void {
    this.listen();
    this.inShell = state.root.firstChild?.component === ShellComponent;
    this.page = this.buildTitle(state) ?? dataTitle(state.root) ?? findNavItem(state.url)?.label;
    this.apply();
  }

  /**
   * The company name arrives after the first screen has drawn. The service is
   * fetched on first use, not in the constructor: the router creates this
   * class, and the service's HTTP client leads back to the router.
   */
  private listen(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    this.injector.get(WorkspaceService).workspace$.subscribe((workspace) => {
      this.company = workspace.name;
      this.apply();
    });
  }

  private apply(): void {
    this.title.setTitle(documentTitle(this.page, this.inShell ? this.company : null));
  }
}

/** `data.title` of the deepest route, which the screens written before Angular's route `title` still use. */
function dataTitle(root: ActivatedRouteSnapshot): string | undefined {
  let route = root;
  while (route.firstChild) {
    route = route.firstChild;
  }
  const title = route.data?.['title'];
  return typeof title === 'string' && title ? title : undefined;
}
