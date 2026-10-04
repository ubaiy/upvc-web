import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Margins are a card on Settings → Pricing and tax (card U7). The old address
// keeps working for bookmarks and for the shell's interim tab strip.
const routes: Routes = [{ path: '', pathMatch: 'full', redirectTo: '/profile?tab=pricing' }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TypeMarginRoutingModule {}
