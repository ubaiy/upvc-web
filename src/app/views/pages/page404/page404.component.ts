import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { PRODUCT_NAME, documentTitle } from 'src/app/shared/configs/product';

@Component({
  selector: 'app-page404',
  templateUrl: './page404.component.html',
  styleUrls: ['./page404.component.scss'],
})
export class Page404Component implements OnInit {
  readonly product = PRODUCT_NAME;

  constructor(private title: Title, private location: Location) {}

  ngOnInit(): void {
    this.title.setTitle(documentTitle('Page not found'));
  }

  back(): void {
    this.location.back();
  }
}
