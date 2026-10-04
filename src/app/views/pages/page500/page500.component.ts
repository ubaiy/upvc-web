import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-page500',
  templateUrl: './page500.component.html',
  styleUrls: ['./page500.component.scss'],
})
export class Page500Component implements OnInit {
  constructor(private title: Title, private location: Location) {}

  ngOnInit(): void {
    this.title.setTitle('Something went wrong · UPVC');
  }

  /** Back to the page that failed, which loads it again. */
  retry(): void {
    this.location.back();
  }
}
