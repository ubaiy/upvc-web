import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SortEvent } from 'primeng/api';
import { Table } from 'primeng/table';
import { IMasterListDto } from 'src/app/shared/model/masters/masterList.model';

@Component({
  selector: 'app-masters',
  templateUrl: './masters.component.html',
  styleUrls: ['./masters.component.scss'],
})
export class MastersComponent {
  masterData: IMasterListDto[] = [];
  title?: string;
  inputValue: string;
  constructor(private _activeRoute: ActivatedRoute, private _router: Router) {
    let data = this._activeRoute.snapshot.data;
    this.masterData = data['list'];
    this.title = this._activeRoute.snapshot.title;
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

  public redirectToEdit(data?: IMasterListDto) {
    console.log(data);
    if (data) {
      this._router.navigate([`masters/${this.title}/${data.id}`]);
    } else {
      this._router.navigate([`masters/${this.title}`]);
    }
  }
}
