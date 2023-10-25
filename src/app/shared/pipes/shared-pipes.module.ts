import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ExcerptPipe } from './excerpt.pipe';
import { TrueYesPipe } from './trueYes.pipe';

const pipes = [ExcerptPipe, TrueYesPipe];

@NgModule({
  imports: [CommonModule],
  declarations: pipes,
  exports: pipes,
})
export class SharedPipesModule {}
