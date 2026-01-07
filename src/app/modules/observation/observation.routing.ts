import { RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';

const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/observation-form/observation-form.component').then(
        (c) => c.ObservationFormComponent,
      ),
  },
  {
    path: 'confirmed',
    loadComponent: () =>
      import(
        './components/observation-confirmation/observation-confirmation.component'
      ).then((c) => c.ObservationConfirmationComponent),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ObservationRoutingModule {}
