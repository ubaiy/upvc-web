import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'trueYes' })
export class TrueYesPipe implements PipeTransform {
  transform(value: boolean) {
    if (value == true) {
      return 'Yes';
    } else {
      return 'No';
    }
  }
}
