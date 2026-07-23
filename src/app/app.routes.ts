import { Routes } from '@angular/router';
import { ReviewLayoutComponent } from './layouts/review-layout/review-layout.component';
import { MaskReviewPageComponent } from './pages/mask-review/mask-review-page.component';
import { PassportInferencePageComponent } from './pages/passport-inference/passport-inference-page.component';
import { PassportPortraitTestPageComponent } from './pages/passport-portrait-test/passport-portrait-test-page.component';
import { PassportReviewPageComponent } from './pages/passport-review/passport-review-page.component';

export const routes: Routes = [
  {
    path: '',
    component: ReviewLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'inference'
      },
      {
        path: 'inference',
        component: PassportInferencePageComponent
      },
      {
        path: 'portrait-test',
        component: PassportPortraitTestPageComponent
      },
      {
        path: 'review',
        component: PassportReviewPageComponent
      },
      {
        path: 'mask-review',
        component: MaskReviewPageComponent
      }
    ]
  }
];
