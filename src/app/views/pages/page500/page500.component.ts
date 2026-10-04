import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { PRODUCT_NAME, documentTitle } from 'src/app/shared/configs/product';

@Component({
  selector: 'app-page500',
  templateUrl: './page500.component.html',
  styleUrls: ['./page500.component.scss'],
})
export class Page500Component implements OnInit {
  readonly product = PRODUCT_NAME;

  constructor(private title: Title, private location: Location) {}

  ngOnInit(): void {
    this.title.setTitle(documentTitle('Something went wrong'));
  }

  /** Back to the page that failed, which loads it again. */
  retry(): void {
    this.location.back();
  }
}
