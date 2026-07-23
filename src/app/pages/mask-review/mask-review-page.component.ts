import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  MaskReviewDecisionStatus,
  MaskReviewSessionData
} from '../../core/models/passport-record.model';
import { PassportRecordsService } from '../../core/services/passport-records.service';

@Component({
  selector: 'app-mask-review-page',
  imports: [CommonModule, DatePipe],
  templateUrl: './mask-review-page.component.html',
  styleUrl: './mask-review-page.component.scss'
})
export class MaskReviewPageComponent {
  private readonly recordsService = inject(PassportRecordsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  session: MaskReviewSessionData | null = null;
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadSession();
  }

  get currentItem() {
    return this.session?.current_item ?? null;
  }

  get hasCurrentItem(): boolean {
    return this.currentItem !== null;
  }

  get currentStatusLabel(): string {
    const status = this.currentItem?.status ?? 'pending';
    if (status === 'approved') {
      return 'Da dat';
    }
    if (status === 'rejected') {
      return 'Da loi';
    }
    return 'Chua review';
  }

  loadSession(fileName?: string): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.recordsService
      .getMaskReviewSession(fileName)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.session = response.data;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage = 'Khong tai duoc phien review mask.';
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  goPrevious(): void {
    const previousFileName = this.currentItem?.previous_file_name;
    if (!previousFileName) {
      return;
    }

    this.loadSession(previousFileName);
  }

  goNext(): void {
    const currentItem = this.currentItem;
    if (!currentItem) {
      this.loadSession();
      return;
    }

    if (currentItem.status === 'pending') {
      this.submitDecision('approved');
      return;
    }

    if (currentItem.next_file_name) {
      this.loadSession(currentItem.next_file_name);
      return;
    }

    this.loadSession();
  }

  rejectCurrent(): void {
    if (this.currentItem?.status === 'rejected') {
      return;
    }

    this.submitDecision('rejected');
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase() ?? '';
    if (['input', 'textarea', 'select', 'button'].includes(tagName)) {
      return;
    }

    if (this.isLoading || this.isSubmitting || !this.currentItem) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'arrowright' || key === 'n') {
      event.preventDefault();
      this.goNext();
    } else if (key === 'arrowleft' || key === 'p') {
      event.preventDefault();
      this.goPrevious();
    } else if (key === 'l') {
      event.preventDefault();
      this.rejectCurrent();
    }
  }

  private submitDecision(decision: MaskReviewDecisionStatus): void {
    const currentItem = this.currentItem;
    if (!currentItem) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.recordsService
      .submitMaskReviewDecision({
        file_name: currentItem.file_name,
        decision
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.session = response.data;
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage = 'Khong luu duoc ket qua review cho anh hien tai.';
          this.isSubmitting = false;
          this.cdr.detectChanges();
        }
      });
  }
}
