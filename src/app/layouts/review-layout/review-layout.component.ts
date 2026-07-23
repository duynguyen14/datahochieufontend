import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-review-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './review-layout.component.html',
  styleUrl: './review-layout.component.scss'
})
export class ReviewLayoutComponent {}
