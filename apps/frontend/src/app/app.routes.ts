import { Routes } from '@angular/router';
import { AppLayoutComponent } from './components/app-layout/app-layout.component';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { DashboardPage } from './pages/dashboard/dashboard.page';
import { ForgotPasswordPage } from './pages/forgot-password/forgot-password.page';
import { LoginPage } from './pages/login/login.page';
import { RegisterPage } from './pages/register/register.page';
import { ResetPasswordPage } from './pages/reset-password/reset-password.page';
import { VerifyEmailPage } from './pages/verify-email/verify-email.page';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', component: LoginPage, canActivate: [guestGuard] },
  { path: 'register', component: RegisterPage, canActivate: [guestGuard] },
  { path: 'verify-email', component: VerifyEmailPage },
  { path: 'forgot-password', component: ForgotPasswordPage },
  { path: 'reset-password', component: ResetPasswordPage },
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardPage },
      {
        path: 'documents',
        loadComponent: () => import('./pages/documents/documents.page').then((m) => m.DocumentsPage),
      },
      {
        path: 'documents/:id',
        loadComponent: () => import('./pages/document-detail/document-detail.page').then((m) => m.DocumentDetailPage),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
