import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-page404',
  templateUrl: './page404.component.html',
  styleUrls: ['./page404.component.scss'],
})
export class Page404Component implements OnInit {
  constructor(private title: Title, private location: Location) {}

  ngOnInit(): void {
    this.title.setTitle('Page not found · UPVC');
  }

  back(): void {
    this.location.back();
  }
}
