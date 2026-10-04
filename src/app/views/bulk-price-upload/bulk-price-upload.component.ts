import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

/**
 * The old Bulk Price page. Its form now lives in the "Update rates" dialog of
 * the Catalogue page (`update-rates-dialog.component.ts`), so the old address
 * `/bulk-price-update` opens the catalogue with that dialog showing.
 */
@Component({
  selector: 'app-bulk-price-upload',
  template: '',
})
export class BulkPriceUploadComponent implements OnInit {
  constructor(private _router: Router) {}

  ngOnInit(): void {
    this._router.navigate(['/masters/profile'], { queryParams: { rates: 1 }, replaceUrl: true });
  }
}
