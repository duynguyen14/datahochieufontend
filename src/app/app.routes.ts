import { Routes } from '@angular/router';
import { ReviewLayoutComponent } from './layouts/review-layout/review-layout.component';
import { PassportReviewPageComponent } from './pages/passport-review/passport-review-page.component';

export const routes: Routes = [
  {
    path: '',
    component: ReviewLayoutComponent,
    children: [
      {
        path: '',
        component: PassportReviewPageComponent
      }
    ]
  }
];
