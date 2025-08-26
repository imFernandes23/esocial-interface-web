import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'gerenciamento', pathMatch: 'full'},
  { path: 'gerenciamento', loadComponent: () => import('./pages/gerenciamento/gerenciamento.component/gerenciamento.component').then(m => m.GerenciamentoComponent) },
  { path: 'gerenciamento/:schemaId/evento/:fileName', loadComponent: () => import('./pages/gerenciamento/evento-detail.component/evento-detail.component').then(m => m.EventoDetailComponent) },
  { path: 'gestao', loadComponent: () => import('./pages/gestao/gestao.component/gestao.component').then(m => m.GestaoComponent) },
];
