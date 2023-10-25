import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { IProductListDto } from 'src/app/shared/model/profile/productList.model';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent {
  profileList: IProductListDto[] = [];
  inputValue: string = '';
  constructor(private _activeRoute: ActivatedRoute) {
    this.profileList = this._activeRoute.snapshot.data['list'];
  }

  public customSort(event: SortEvent) {
    if (event.data) {
      event.data.sort((data1, data2) => {
        if (event.field && event.order) {
          let value1 = data1[event.field];
          let value2 = data2[event.field];
          let result = null;

          if (value1 == null && value2 != null) result = -1;
          else if (value1 != null && value2 == null) result = 1;
          else if (value1 == null && value2 == null) result = 0;
          else if (typeof value1 === 'string' && typeof value2 === 'string')
            result = value1.localeCompare(value2);
          else result = value1 < value2 ? -1 : value1 > value2 ? 1 : 0;

          return event.order * result;
        } else {
          return 0;
        }
      });
    }
  }

  clear(table: Table) {
    table.clear();
    this.inputValue = '';
  }
}
